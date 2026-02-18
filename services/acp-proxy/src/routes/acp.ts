import { agentProcesses, getOrCreateProcess } from "../agent-process";

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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function isSessionConfigMethod(method: unknown): method is string {
  return (
    method === "session/new" ||
    method === "session/load" ||
    method === "session/resume"
  );
}

function applySessionPolicy(body: Record<string, unknown>): void {
  if (!isSessionConfigMethod(body.method)) {
    return;
  }

  const params = toRecord(body.params);
  if (!params) {
    return;
  }

  const meta = toRecord(params._meta) ?? {};
  const claudeCode = toRecord(meta.claudeCode) ?? {};
  const options = toRecord(claudeCode.options) ?? {};

  // TODO: Remove, `allowedTools` is not a thing.
  options.allowedTools = [...LAB_TOOL_ALLOWLIST];
  options.disallowedTools = [...CLAUDE_TOOL_DENYLIST];
  options.settingSources = ["project"];

  claudeCode.options = options;
  meta.claudeCode = claudeCode;
  meta.disableBuiltInTools = true;
  params._meta = meta;
  body.params = params;
}

export async function handleAcpPost(
  request: Request,
  serverId: string
): Promise<Response> {
  const agent = getOrCreateProcess(serverId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32_700, message: "Parse error" },
        id: null,
      },
      { status: 400 }
    );
  }

  // TODO: Implement widelogging
  console.log(
    `[acp:${serverId}] POST:`,
    body.method ?? (body.result ? "response" : "notification"),
    body.id !== undefined ? `id=${body.id}` : ""
  );

  applySessionPolicy(body);

  if (!agent.isRunning) {
    agent.spawnProcess();
  }

  const isNotification =
    body.id === undefined || body.id === null || !("id" in body);

  if (isNotification) {
    await agent.sendRequest(body);
    return new Response(null, { status: 202 });
  }

  // JSON-RPC response (e.g. permission reply from acp-http-client):
  // has id + result/error but no method. Just write to stdin, don't
  // wait for a reply — the agent consumes it and moves on.
  const isResponse =
    !body.method && (body.result !== undefined || body.error !== undefined);

  if (isResponse) {
    console.log(`[acp:${serverId}] forwarding response id=${body.id} to stdin`);
    agent.sendResponse(body);
    return new Response(null, { status: 202 });
  }

  try {
    const response = await agent.sendRequest(body);

    if (
      body.method === "initialize" &&
      response.result &&
      typeof response.result === "object"
    ) {
      const result = Object.fromEntries(Object.entries(response.result));
      if (result.configOptions) {
        agent.configOptions = result.configOptions;
      }
    }

    return Response.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32_603, message },
        id: body.id ?? null,
      },
      { status: 500 }
    );
  }
}

export function handleAcpGet(request: Request, serverId: string): Response {
  const agent = agentProcesses.get(serverId);
  if (!agent) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32_002, message: "Server not found" },
        id: null,
      },
      { status: 404 }
    );
  }

  const lastEventIdHeader = request.headers.get("Last-Event-ID");
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : -1;

  const encoder = new TextEncoder();
  const HEARTBEAT = encoder.encode(":heartbeat\n\n");
  const HEARTBEAT_INTERVAL_MS = 15_000;

  const stream = new ReadableStream({
    start(controller) {
      const replay = agent.getEventsSince(lastEventId);
      for (const event of replay) {
        const frame = `id: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      }

      const unsubscribe = agent.subscribe((event) => {
        const frame = `id: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          unsubscribe();
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(HEARTBEAT);
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function handleAcpDelete(serverId: string): Promise<Response> {
  const agent = agentProcesses.get(serverId);
  if (agent) {
    await agent.shutdown();
    agentProcesses.delete(serverId);
  }

  return new Response(null, { status: 204 });
}
