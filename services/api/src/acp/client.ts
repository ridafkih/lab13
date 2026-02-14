import {
  AcpHttpClient,
  type AcpHttpClientOptions,
  type AnyMessage,
  type NewSessionRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "acp-http-client";
import type { AcpEvent } from "../types/dependencies";

type EventListener = (envelope: AnyMessage) => void;

interface CreateSessionOptions {
  cwd?: string;
  mcpServers?: NewSessionRequest["mcpServers"];
  model?: string;
  systemPrompt?: string;
  loadSessionId?: string;
}

const PROMPT_STARTUP_WAIT_MS = 1500;

const LAB_TOOL_ALLOWLIST = [
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
  "Bash",
  "Browser",
  "Containers",
  "Logs",
  "RestartProcess",
  "InternalUrl",
  "PublicUrl",
  "Read",
  "Write",
  "Patch",
  "Edit",
  "Grep",
  "Glob",
  "GitHub",
  "WebFetch",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
] as const;

const CLAUDE_TOOL_DENYLIST = [
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "WebSearch",
  "WebFetch",
  "SlashCommand",
  "Skill",
  "NotebookEdit",
] as const;

function buildSessionInit(options: CreateSessionOptions): NewSessionRequest {
  const init: NewSessionRequest = {
    cwd: options.cwd ?? "/",
    mcpServers: options.mcpServers ?? [],
  };

  const claudeCodeOptions: Record<string, unknown> = {
    allowedTools: [...LAB_TOOL_ALLOWLIST],
    disallowedTools: [...CLAUDE_TOOL_DENYLIST],
    settingSources: ["project"],
  };

  if (options.model) {
    claudeCodeOptions.model = options.model;
  }

  init._meta = {
    disableBuiltInTools: true,
    claudeCode: {
      options: claudeCodeOptions,
    },
    ...(options.systemPrompt
      ? { systemPrompt: { append: options.systemPrompt } }
      : {}),
  };

  return init;
}

function autoApprovePermission(request: RequestPermissionRequest): {
  outcome: RequestPermissionResponse["outcome"];
} {
  const options = request.options ?? [];
  const allow =
    options.find((o) => o.kind === "allow_always") ??
    options.find((o) => o.kind === "allow_once");
  if (allow) {
    return { outcome: { outcome: "selected", optionId: allow.optionId } };
  }
  return { outcome: { outcome: "cancelled" } };
}

function supportsSessionResume(initializeResult: unknown): boolean {
  if (typeof initializeResult !== "object" || initializeResult === null) {
    return false;
  }

  const root = Object.fromEntries(Object.entries(initializeResult));
  const capabilities =
    typeof root.agentCapabilities === "object" &&
    root.agentCapabilities !== null
      ? Object.fromEntries(Object.entries(root.agentCapabilities))
      : null;
  const sessionCapabilities =
    capabilities &&
    typeof capabilities.sessionCapabilities === "object" &&
    capabilities.sessionCapabilities !== null
      ? Object.fromEntries(Object.entries(capabilities.sessionCapabilities))
      : null;

  return Boolean(sessionCapabilities?.resume);
}

function isAcpTransportTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("The operation timed out") ||
    message.includes("TimeoutError")
  );
}

export class AgentSessionManager {
  private readonly baseUrl: string;
  private readonly clients = new Map<string, AcpHttpClient>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly eventBuffers = new Map<string, AnyMessage[]>();
  private readonly sessionIds = new Map<string, string>();
  private readonly sessionOptions = new Map<string, CreateSessionOptions>();
  private readonly inFlightPrompts = new Map<string, Promise<void>>();
  private readonly fatalResetsInFlight = new Set<string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  hasSession(serverId: string): boolean {
    return this.clients.has(serverId) && this.sessionIds.has(serverId);
  }

  async createSession(
    serverId: string,
    options: CreateSessionOptions
  ): Promise<string> {
    const listeners = this.listeners.get(serverId) ?? new Set<EventListener>();
    this.listeners.set(serverId, listeners);

    const buffer = this.eventBuffers.get(serverId) ?? [];
    this.eventBuffers.set(serverId, buffer);

    const emit = (envelope: AnyMessage) => {
      if (listeners.size === 0) {
        buffer.push(envelope);
      } else {
        for (const listener of listeners) {
          listener(envelope);
        }
      }
    };

    const clientOptions: AcpHttpClientOptions = {
      baseUrl: this.baseUrl,
      fetch: (async (...args: Parameters<typeof fetch>) => {
        const [input, init] = args;
        try {
          return await fetch(input, init);
        } catch (error) {
          if (isAcpTransportTimeoutError(error)) {
            await this.handleFatalTransportTimeout(serverId, error);
          }
          throw error;
        }
      }) as unknown as typeof fetch,
      transport: {
        path: `/v1/acp/${serverId}`,
        bootstrapQuery: { agent: "claude", permissionMode: "bypass" },
      },
      client: {
        requestPermission: (request) =>
          Promise.resolve(autoApprovePermission(request)),
        sessionUpdate: (notification: SessionNotification) => {
          const envelope: AnyMessage = {
            jsonrpc: "2.0",
            method: "session/update",
            params: notification,
          };
          emit(envelope);
          return Promise.resolve();
        },
      },
    };

    const client = new AcpHttpClient(clientOptions);
    this.clients.set(serverId, client);

    const initResult = await client.initialize();

    const sessionInit = buildSessionInit(options);
    const canLoadSession = Boolean(initResult.agentCapabilities?.loadSession);
    const canResumeSession = supportsSessionResume(initResult);
    const requestedLoadSessionId = options.loadSessionId;

    if (requestedLoadSessionId && canResumeSession) {
      try {
        await client.unstableResumeSession({
          sessionId: requestedLoadSessionId,
          cwd: sessionInit.cwd,
          mcpServers: sessionInit.mcpServers,
          _meta: sessionInit._meta,
        });
        this.sessionIds.set(serverId, requestedLoadSessionId);
        this.sessionOptions.set(serverId, { ...options });
        return requestedLoadSessionId;
      } catch {
        // Fall through to load/new fallback chain
      }
    }

    if (canLoadSession && requestedLoadSessionId) {
      try {
        await client.loadSession({
          sessionId: requestedLoadSessionId,
          cwd: sessionInit.cwd,
          mcpServers: sessionInit.mcpServers,
          _meta: sessionInit._meta,
        });
        this.sessionIds.set(serverId, requestedLoadSessionId);
        this.sessionOptions.set(serverId, { ...options });
        return requestedLoadSessionId;
      } catch {
        // Fall through to creating a new session
      }
    }

    const newSessionResult = await client.newSession(sessionInit);
    this.sessionIds.set(serverId, newSessionResult.sessionId);
    this.sessionOptions.set(serverId, {
      ...options,
      loadSessionId: newSessionResult.sessionId,
    });

    return newSessionResult.sessionId;
  }

  sendMessage(serverId: string, text: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No session for server: ${serverId}`);
    }

    const sessionId = this.sessionIds.get(serverId);
    if (!sessionId) {
      throw new Error(`No session ID for server: ${serverId}`);
    }

    // Always emit a user_message event so it flows through SSE, gets
    // stored in the DB, and survives page reloads. The frontend does
    // NOT add user messages optimistically — this is the single source.
    const userEnvelope: AnyMessage = {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "user_message",
          content: { type: "text", text },
        },
      },
    };

    this.emitSessionEvent(serverId, userEnvelope);

    const pendingPrompt = client
      .prompt({
        sessionId,
        prompt: [{ type: "text", text }],
      })
      .then(() => {
        this.emitSessionEvent(serverId, {
          jsonrpc: "2.0",
          id: null,
          result: { stopReason: "end_turn" },
        });
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Prompt failed";
        this.emitSessionEvent(serverId, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32_603, message },
        });
        this.emitSessionEvent(serverId, {
          jsonrpc: "2.0",
          id: null,
          result: { stopReason: "end_turn" },
        });
        throw error;
      })
      .finally(() => {
        this.inFlightPrompts.delete(serverId);
      });

    this.inFlightPrompts.set(
      serverId,
      pendingPrompt.catch(() => undefined)
    );
    return this.awaitPromptStart(pendingPrompt);
  }

  async setSessionModel(serverId: string, model: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No session for server: ${serverId}`);
    }

    const sessionId = this.sessionIds.get(serverId);
    if (!sessionId) {
      throw new Error(`No session ID for server: ${serverId}`);
    }

    await client.unstableSetSessionModel({
      sessionId,
      modelId: model,
    });
  }

  private async awaitPromptStart(pendingPrompt: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        pendingPrompt,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, PROMPT_STARTUP_WAIT_MS);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async handleFatalTransportTimeout(
    serverId: string,
    error: unknown
  ): Promise<void> {
    if (this.fatalResetsInFlight.has(serverId)) {
      return;
    }

    this.fatalResetsInFlight.add(serverId);
    try {
      const message =
        error instanceof Error ? error.message : "ACP transport timed out";

      this.emitSessionEvent(serverId, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32_603, message: `ACP transport timeout: ${message}` },
      });

      const priorSessionId = this.sessionIds.get(serverId);
      const priorOptions = this.sessionOptions.get(serverId);
      const client = this.clients.get(serverId);
      if (client) {
        await client.disconnect().catch(() => undefined);
      }

      this.clients.delete(serverId);
      this.sessionIds.delete(serverId);
      this.inFlightPrompts.delete(serverId);

      if (priorOptions) {
        await this.createSession(serverId, {
          ...priorOptions,
          loadSessionId: priorSessionId ?? priorOptions.loadSessionId,
        }).catch(() => undefined);
      }

      this.emitSessionEvent(serverId, {
        jsonrpc: "2.0",
        id: null,
        result: { stopReason: "end_turn" },
      });
    } finally {
      this.fatalResetsInFlight.delete(serverId);
    }
  }

  async cancelPrompt(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No session for server: ${serverId}`);
    }

    const sessionId = this.sessionIds.get(serverId);
    if (!sessionId) {
      throw new Error(`No session ID for server: ${serverId}`);
    }

    await client.cancel({ sessionId });

    const finishEnvelope: AnyMessage = {
      jsonrpc: "2.0",
      id: null,
      result: { stopReason: "cancelled" },
    };
    const listeners = this.listeners.get(serverId);
    if (listeners) {
      for (const listener of listeners) {
        listener(finishEnvelope);
      }
    }
  }

  async destroySession(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    this.inFlightPrompts.delete(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
      this.listeners.delete(serverId);
      this.sessionIds.delete(serverId);
      this.sessionOptions.delete(serverId);
    }
  }

  onSessionEvent(serverId: string, callback: EventListener): () => void {
    let listenerSet = this.listeners.get(serverId);
    if (!listenerSet) {
      listenerSet = new Set();
      this.listeners.set(serverId, listenerSet);
    }
    listenerSet.add(callback);

    const buffer = this.eventBuffers.get(serverId);
    if (buffer && buffer.length > 0) {
      const events = buffer.splice(0);
      for (const envelope of events) {
        callback(envelope);
      }
    }

    return () => listenerSet.delete(callback);
  }

  emitEvent(serverId: string, envelope: AnyMessage): void {
    this.emitSessionEvent(serverId, envelope);
  }

  private emitSessionEvent(serverId: string, envelope: AnyMessage): void {
    const listeners = this.listeners.get(serverId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        listener(envelope);
      }
      return;
    }

    const buffer = this.eventBuffers.get(serverId);
    if (buffer) {
      buffer.push(envelope);
    }
  }

  async listAgents(): Promise<{ agents: Record<string, unknown>[] }> {
    const response = await fetch(`${this.baseUrl}/v1/agents`);
    return response.json();
  }

  async getAgent(
    id: string,
    opts?: { config?: boolean }
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}/v1/agents/${id}`);
    if (opts?.config) {
      url.searchParams.set("config", "true");
    }
    const response = await fetch(url);
    return response.json();
  }

  async listFsEntries(query: {
    path?: string;
  }): Promise<{ name: string; path: string; entryType: string }[]> {
    const url = new URL(`${this.baseUrl}/v1/fs/entries`);
    if (query.path) {
      url.searchParams.set("path", query.path);
    }
    const response = await fetch(url);
    return response.json();
  }

  async readFsFile(query: { path: string }): Promise<Uint8Array> {
    const url = new URL(`${this.baseUrl}/v1/fs/file`);
    url.searchParams.set("path", query.path);
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export type AcpClient = AgentSessionManager;

export function createAcpClient(baseUrl: string): AcpClient {
  return new AgentSessionManager(baseUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? { ...value } : null;
}

function hasMessageMethod(envelope: AnyMessage): envelope is AnyMessage & {
  method: string;
  params: unknown;
  id?: string | number | null;
} {
  return "method" in envelope && "params" in envelope;
}

export function envelopeToSandboxEvent(
  envelope: AnyMessage,
  sequence = 0
): AcpEvent | null {
  if ("error" in envelope && envelope.error) {
    return {
      type: "error",
      sequence,
      data: { error: envelope.error as unknown },
    };
  }

  if ("result" in envelope) {
    const result = toRecord(envelope.result);
    if (result?.stopReason) {
      return {
        type: "turn.ended",
        sequence,
        data: result,
      };
    }
  }

  if (!hasMessageMethod(envelope)) {
    return null;
  }

  const method = envelope.method;
  const params = envelope.params;

  if (typeof method !== "string" || !isRecord(params)) {
    return null;
  }

  if (method === "session/update") {
    const update = toRecord(params.update);
    const sessionUpdate = update?.sessionUpdate;

    if (sessionUpdate === "agent_message_chunk") {
      const content = toRecord(update?.content);
      return {
        type: "item.delta",
        sequence,
        data: {
          delta: typeof content?.text === "string" ? content.text : "",
        },
      };
    }

    if (
      sessionUpdate === "tool_call" ||
      sessionUpdate === "tool_call_update" ||
      sessionUpdate === "item_completed"
    ) {
      return {
        type: "item.started",
        sequence,
        data: update ?? {},
      };
    }
  }

  const data: Record<string, unknown> = { ...params };
  if ("id" in envelope && envelope.id !== undefined) {
    data._rpcId = envelope.id;
  }

  return {
    type: method,
    sequence,
    data,
  };
}
