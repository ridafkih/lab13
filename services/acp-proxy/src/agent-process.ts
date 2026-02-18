import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Subprocess, sleep, spawn } from "bun";

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcMessage & { id: string | number };

interface BufferedEvent {
  id: number;
  data: JsonRpcMessage;
}

type SseSubscriber = (event: BufferedEvent) => void;

interface ManagedTerminal {
  process: Subprocess;
  output: string;
  exitCode: number | null;
  exited: Promise<number>;
  waiters: Array<(code: number) => void>;
}

const EVENT_BUFFER_CAP = 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30_000;
const PROMPT_TIMEOUT_MS = 10 * 60_000;
const SHUTDOWN_GRACE_MS = 5000;
const ALLOWED_TOOL_NAMES = new Set([
  "mcp__lab__Bash",
  "mcp__lab__Browser",
  "mcp__lab__Containers",
  "mcp__lab__Logs",
  "mcp__lab__RestartProcess",
  "mcp__lab__InternalUrl",
  "mcp__lab__PublicUrl",
  "mcp__lab__Read",
  "mcp__lab__Write",
  "mcp__lab__Patch",
  "mcp__lab__Edit",
  "mcp__lab__Grep",
  "mcp__lab__Glob",
  "mcp__lab__GitHub",
  "mcp__lab__WebFetch",
  "mcp__lab__TodoWrite",
  "mcp__lab__TaskCreate",
  "mcp__lab__TaskUpdate",
]);

function isJsonRpcResponse(
  message: JsonRpcMessage
): message is JsonRpcResponse {
  return typeof message.id === "string" || typeof message.id === "number";
}

function toParamsRecord(params: unknown): Record<string, unknown> | undefined {
  if (typeof params !== "object" || params === null) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(params));
}

function getStringParam(
  params: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = params?.[key];
  return typeof value === "string" ? value : undefined;
}

function getStringArrayParam(
  params: Record<string, unknown> | undefined,
  key: string
): string[] {
  const value = params?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

function isToolsListMethod(method: string): boolean {
  return method === "tools/list";
}

function isToolsCallMethod(method: string): boolean {
  return method === "tools/call";
}

function getToolNameFromCall(params: unknown): string | undefined {
  const paramsRecord = toRecord(params);
  if (!paramsRecord) {
    return undefined;
  }
  const directName = paramsRecord.name;
  if (typeof directName === "string") {
    return directName;
  }
  const toolName = paramsRecord.toolName;
  if (typeof toolName === "string") {
    return toolName;
  }
  return undefined;
}

function createToolDeniedResponse(
  id: string | number | null | undefined,
  toolName: string | undefined
): JsonRpcResponse {
  const deniedToolName = toolName ?? "(missing)";
  return {
    jsonrpc: "2.0",
    id: typeof id === "string" || typeof id === "number" ? id : 0,
    error: {
      code: -32_001,
      message: `Tool not allowed by server policy: ${deniedToolName}`,
    },
  };
}

function filterToolsInResult(response: JsonRpcResponse): JsonRpcResponse {
  const resultRecord = toRecord(response.result);
  if (!(resultRecord && Array.isArray(resultRecord.tools))) {
    return response;
  }

  const filteredTools = resultRecord.tools.filter((toolEntry) => {
    const toolRecord = toRecord(toolEntry);
    return (
      !!toolRecord &&
      typeof toolRecord.name === "string" &&
      ALLOWED_TOOL_NAMES.has(toolRecord.name)
    );
  });

  const sanitizedResult = {
    ...resultRecord,
    tools: filteredTools,
  };

  return {
    ...response,
    result: sanitizedResult,
  };
}

export class AgentProcess {
  private readonly pendingRequests = new Map<string | number, PendingRequest>();
  private readonly eventBuffer: BufferedEvent[] = [];
  private readonly sseSubscribers = new Set<SseSubscriber>();
  private readonly terminals = new Map<string, ManagedTerminal>();

  readonly serverId: string;
  private process: Subprocess | null = null;
  private processHasExited = false;
  private eventSinkQueue: Promise<void> = Promise.resolve();
  private eventCounter = 0;
  private terminalCounter = 0;
  private stdoutBuffer = "";
  private cachedConfigOptions: unknown = null;
  private workingDir = "/workspaces";
  private readonly eventSinkUrl = process.env.ACP_EVENT_SINK_URL ?? "";

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  get isRunning(): boolean {
    return this.process !== null && !this.processHasExited;
  }

  get configOptions(): unknown {
    return this.cachedConfigOptions;
  }

  set configOptions(value: unknown) {
    this.cachedConfigOptions = value;
  }

  spawnProcess(workingDir?: string): void {
    if (this.process) {
      return;
    }

    this.workingDir = workingDir ?? "/workspaces";
    this.processHasExited = false;

    this.process = spawn(
      ["npx", "-y", "@zed-industries/claude-code-acp@0.16.1"],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "inherit",
        cwd: this.workingDir,
        env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin` },
      }
    );

    this.process.exited.then((exitCode) => {
      this.handleProcessExit(exitCode);
    });

    this.readStdout();
  }

  private handleProcessExit(exitCode: number): void {
    this.processHasExited = true;
    this.process = null;

    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(
        new Error(`Agent process exited with code ${exitCode}`)
      );
    }
    this.pendingRequests.clear();
  }

  private getRequestTimeoutMs(method: string | undefined): number {
    if (
      method === "initialize" ||
      method === "session/new" ||
      method === "session/load" ||
      method === "session/resume"
    ) {
      return SESSION_BOOTSTRAP_TIMEOUT_MS;
    }
    if (method === "session/prompt") {
      return PROMPT_TIMEOUT_MS;
    }
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private async readStdout(): Promise<void> {
    const proc = this.process;
    if (!proc?.stdout) {
      return;
    }

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        this.stdoutBuffer += decoder.decode(value, { stream: true });
        this.processLines();
      }
    } catch {
      // Process exited
    }
  }

  private processLines(): void {
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(trimmed);
      } catch {
        continue;
      }

      this.handleMessage(message);
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    console.log(
      `[agent:${this.serverId}] stdout:`,
      message.method ?? (message.result ? "response" : "unknown"),
      message.id !== undefined ? `id=${message.id}` : ""
    );

    // Response to a pending request (e.g. initialize, session/new, prompt)
    if (
      message.id !== undefined &&
      message.id !== null &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (isJsonRpcResponse(message)) {
          pending.resolve(message);
        } else {
          pending.reject(new Error("Invalid JSON-RPC response id"));
        }
        return;
      }
    }

    // Handle server-initiated requests (method + id = request needing response)
    if (message.method && message.id !== undefined && message.id !== null) {
      this.handleServerRequest(message);
    }

    this.bufferAndBroadcast(message);
  }

  private handleServerRequest(message: JsonRpcMessage): void {
    if (!message.method) {
      return;
    }
    const method = message.method;
    const params = toParamsRecord(message.params);
    const id = message.id;

    const respond = (result: unknown) => {
      this.writeToStdin({ jsonrpc: "2.0", id, result });
    };

    const respondError = (code: number, msg: string) => {
      this.writeToStdin({ jsonrpc: "2.0", id, error: { code, message: msg } });
    };

    switch (method) {
      case "session/request_permission":
        this.handlePermission(params, respond);
        break;
      case "fs/read_text_file":
        this.handleReadTextFile(params, respond, respondError);
        break;
      case "fs/write_text_file":
        this.handleWriteTextFile(params, respond, respondError);
        break;
      case "terminal/create":
        this.handleTerminalCreate(params, respond, respondError);
        break;
      case "terminal/output":
        this.handleTerminalOutput(params, respond, respondError);
        break;
      case "terminal/release":
        this.handleTerminalRelease(params, respond);
        break;
      case "terminal/wait_for_exit":
        this.handleTerminalWaitForExit(params, respond, respondError);
        break;
      case "terminal/kill":
        this.handleTerminalKill(params, respond);
        break;
      default:
        console.log(`[agent:${this.serverId}] unhandled method: ${method}`);
        respondError(-32_601, `Method not found: ${method}`);
    }
  }

  private handlePermission(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void
  ): void {
    const options = Array.isArray(params?.options) ? params.options : [];
    const typedOptions = options.filter(
      (option): option is Record<string, unknown> =>
        typeof option === "object" && option !== null
    );
    const allow =
      typedOptions.find((option) => option.kind === "allow_always") ??
      typedOptions.find((option) => option.kind === "allow_once");
    const optionId =
      allow && typeof allow.optionId === "string" ? allow.optionId : undefined;

    const outcome = optionId
      ? {
          outcome: "selected",
          optionId,
        }
      : { outcome: "approved" };

    console.log(`[agent:${this.serverId}] auto-approving permission`);
    respond({ outcome });
  }

  private handleReadTextFile(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void,
    respondError: (code: number, msg: string) => void
  ): void {
    const path = getStringParam(params, "path");
    if (!path) {
      respondError(-32_602, "Missing path parameter");
      return;
    }

    readFile(path, "utf-8")
      .then((text) => respond({ text }))
      .catch((error) =>
        respondError(-32_603, `Failed to read file: ${getErrorMessage(error)}`)
      );
  }

  private handleWriteTextFile(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void,
    respondError: (code: number, msg: string) => void
  ): void {
    const path = getStringParam(params, "path");
    const text = getStringParam(params, "text");
    if (!path || text === undefined) {
      respondError(-32_602, "Missing path or text parameter");
      return;
    }

    mkdir(dirname(path), { recursive: true })
      .then(() => writeFile(path, text, "utf-8"))
      .then(() => respond({}))
      .catch((error) =>
        respondError(-32_603, `Failed to write file: ${getErrorMessage(error)}`)
      );
  }

  private handleTerminalCreate(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void,
    respondError: (code: number, msg: string) => void
  ): void {
    const command = getStringParam(params, "command");
    if (!command) {
      respondError(-32_602, "Missing command parameter");
      return;
    }

    const args = getStringArrayParam(params, "args");
    const cwd = getStringParam(params, "cwd") ?? this.workingDir;
    const terminalId = `term-${++this.terminalCounter}`;

    try {
      const proc = spawn([command, ...args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd,
        env: { ...process.env },
      });

      const terminal: ManagedTerminal = {
        process: proc,
        output: "",
        exitCode: null,
        exited: proc.exited.then((code) => {
          terminal.exitCode = code;
          for (const waiter of terminal.waiters) {
            waiter(code);
          }
          terminal.waiters.length = 0;
          return code;
        }),
        waiters: [],
      };

      this.collectTerminalOutput(terminal, proc);
      this.terminals.set(terminalId, terminal);

      respond({ terminalId });
    } catch (error) {
      respondError(
        -32_603,
        `Failed to create terminal: ${getErrorMessage(error)}`
      );
    }
  }

  private collectTerminalOutput(
    terminal: ManagedTerminal,
    proc: Subprocess
  ): void {
    const collectStream = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          terminal.output += decoder.decode(value, { stream: true });
        }
      } catch {
        // Stream ended
      }
    };

    if (proc.stdout) {
      collectStream(proc.stdout as unknown as ReadableStream<Uint8Array>);
    }
    if (proc.stderr) {
      collectStream(proc.stderr as unknown as ReadableStream<Uint8Array>);
    }
  }

  private handleTerminalOutput(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void,
    respondError: (code: number, msg: string) => void
  ): void {
    const terminalId = getStringParam(params, "terminalId");
    if (!terminalId) {
      respondError(-32_602, "Missing terminalId parameter");
      return;
    }

    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      respondError(-32_602, `Terminal not found: ${terminalId}`);
      return;
    }

    const output = terminal.output;
    terminal.output = "";
    respond({ output });
  }

  private handleTerminalRelease(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void
  ): void {
    const terminalId = getStringParam(params, "terminalId");
    if (terminalId) {
      this.terminals.delete(terminalId);
    }
    respond({});
  }

  private handleTerminalWaitForExit(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void,
    respondError: (code: number, msg: string) => void
  ): void {
    const terminalId = getStringParam(params, "terminalId");
    if (!terminalId) {
      respondError(-32_602, "Missing terminalId parameter");
      return;
    }

    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      respondError(-32_602, `Terminal not found: ${terminalId}`);
      return;
    }

    if (terminal.exitCode !== null) {
      respond({ exitCode: terminal.exitCode });
      return;
    }

    terminal.waiters.push((code) => {
      respond({ exitCode: code });
    });
  }

  private handleTerminalKill(
    params: Record<string, unknown> | undefined,
    respond: (result: unknown) => void
  ): void {
    const terminalId = getStringParam(params, "terminalId");
    const terminal = terminalId ? this.terminals.get(terminalId) : undefined;
    if (terminal) {
      try {
        terminal.process.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }
    respond({});
  }

  private bufferAndBroadcast(message: JsonRpcMessage): void {
    const event: BufferedEvent = {
      id: this.eventCounter++,
      data: message,
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > EVENT_BUFFER_CAP) {
      this.eventBuffer.shift();
    }

    this.enqueueEventSinkDelivery(event);

    for (const subscriber of this.sseSubscribers) {
      try {
        subscriber(event);
      } catch {
        this.sseSubscribers.delete(subscriber);
      }
    }
  }

  private enqueueEventSinkDelivery(event: BufferedEvent): void {
    if (!this.eventSinkUrl) {
      return;
    }

    this.eventSinkQueue = this.eventSinkQueue
      .then(async () => {
        const response = await fetch(this.eventSinkUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: this.serverId,
            eventId: event.id,
            envelope: event.data,
          }),
        });
        if (!response.ok) {
          throw new Error(
            `event sink rejected event ${event.id} with status ${response.status}`
          );
        }
      })
      .catch((error) => {
        console.warn(
          `[agent:${this.serverId}] failed to push event ${event.id} to api sink:`,
          getErrorMessage(error)
        );
      });
  }

  sendRequest(message: JsonRpcMessage): Promise<JsonRpcResponse> {
    if (
      typeof message.method === "string" &&
      isToolsCallMethod(message.method)
    ) {
      const requestedTool = getToolNameFromCall(message.params);
      if (!(requestedTool && ALLOWED_TOOL_NAMES.has(requestedTool))) {
        return Promise.resolve(
          createToolDeniedResponse(message.id, requestedTool)
        );
      }
    }

    this.writeToStdin(message);

    if (message.id === undefined || message.id === null) {
      return Promise.resolve({ jsonrpc: "2.0", id: 0 });
    }

    const id = message.id;
    const timeoutMs = this.getRequestTimeoutMs(message.method);
    const pending = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
    });

    if (
      typeof message.method === "string" &&
      isToolsListMethod(message.method)
    ) {
      return pending.then((response) => filterToolsInResult(response));
    }

    return pending;
  }

  /** Write a JSON-RPC response to stdin without waiting for a reply. */
  sendResponse(message: JsonRpcMessage): void {
    this.writeToStdin(message);
  }

  private writeToStdin(message: JsonRpcMessage): void {
    const proc = this.process;
    if (!proc?.stdin) {
      throw new Error("Process stdin not available");
    }

    proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  getEventsSince(lastEventId: number): BufferedEvent[] {
    if (lastEventId < 0) {
      return [...this.eventBuffer];
    }

    return this.eventBuffer.filter((e) => e.id > lastEventId);
  }

  subscribe(callback: SseSubscriber): () => void {
    this.sseSubscribers.add(callback);
    return () => {
      this.sseSubscribers.delete(callback);
    };
  }

  async shutdown(): Promise<void> {
    const proc = this.process;
    if (!proc) {
      return;
    }

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Process shutting down"));
    }
    this.pendingRequests.clear();

    try {
      proc.stdin?.end();
    } catch {
      // Already closed
    }

    proc.kill("SIGTERM");

    const killed = await Promise.race([
      proc.exited.then(() => true),
      sleep(SHUTDOWN_GRACE_MS).then(() => false),
    ]);

    if (!killed) {
      proc.kill("SIGKILL");
      await proc.exited;
    }

    this.process = null;
    this.processHasExited = true;
    this.sseSubscribers.clear();

    for (const terminal of this.terminals.values()) {
      try {
        terminal.process.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }
    this.terminals.clear();
  }
}

export const agentProcesses = new Map<string, AgentProcess>();

export function getOrCreateProcess(serverId: string): AgentProcess {
  let agent = agentProcesses.get(serverId);
  if (!agent) {
    agent = new AgentProcess(serverId);
    agentProcesses.set(serverId, agent);
  }
  return agent;
}

export async function restartAllAgentProcesses(reason: string): Promise<void> {
  if (agentProcesses.size === 0) {
    return;
  }

  console.log(
    `[acp-proxy] restarting ${agentProcesses.size} agent process(es): ${reason}`
  );

  const entries = [...agentProcesses.entries()];
  await Promise.all(
    entries.map(async ([serverId, agent]) => {
      try {
        await agent.shutdown();
      } catch (error) {
        console.warn(
          `[acp-proxy] failed to shutdown agent ${serverId}:`,
          getErrorMessage(error)
        );
      }
    })
  );

  agentProcesses.clear();
}
