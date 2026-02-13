import type { Session } from "@lab/database/schema/sessions";
import { buildSseResponse, CORS_HEADERS } from "@lab/http-utilities";
import type { NewSessionRequest } from "acp-http-client";
import { widelog } from "../logging";
import {
  getAgentEvents,
  getMaxSequence,
  storeAgentEvent,
} from "../repositories/agent-event.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import {
  findSessionTasks,
  replaceSessionTasks,
} from "../repositories/session-task.repository";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import type { PromptService } from "../types/prompt";
import type { AcpClient } from "./client";
import { extractTodoEvent, mapToTaskRows } from "./todo-tracker";

type AcpProxyHandler = (request: Request, url: URL) => Promise<Response>;

interface AcpProxyDeps {
  acp: AcpClient;
  publisher: Publisher;
  promptService: PromptService;
  sessionStateStore: SessionStateStore;
  mcpUrl?: string;
}

interface ValidationSuccess<T> {
  ok: true;
  value: T;
}
interface ValidationFailure {
  ok: false;
  response: Response;
}
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface InitializedSession {
  session: Session;
  sandboxSessionId: string;
}

async function safeJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  if (!request.body) {
    return {};
  }
  return await request.json();
}

function corsResponse(body: BodyInit | null, status: number): Response {
  const headers = new Headers(CORS_HEADERS);
  headers.set("Content-Type", "application/json");
  return new Response(body, { status, headers });
}

function resolveWorkspacePath(
  workspaceDir: string | null | undefined,
  requestedPath: string
): string {
  if (workspaceDir && (requestedPath === "." || requestedPath === "")) {
    return workspaceDir;
  }
  if (workspaceDir && !requestedPath.startsWith("/")) {
    return `${workspaceDir}/${requestedPath}`;
  }
  return requestedPath;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

const PATH_PREFIX = /^\/acp/;
const PERMISSION_REPLY_PATTERN = /^\/permissions\/([^/]+)\/reply$/;
const QUESTION_REPLY_PATTERN = /^\/questions\/([^/]+)\/reply$/;
const QUESTION_REJECT_PATTERN = /^\/questions\/([^/]+)\/reject$/;

function buildMcpServers(
  mcpUrl: string | undefined,
  labSessionId: string
): NewSessionRequest["mcpServers"] {
  if (!mcpUrl) {
    return [];
  }
  return [
    {
      name: "lab",
      type: "http",
      url: mcpUrl,
      headers: [{ name: "x-lab-session-id", value: labSessionId }],
    },
  ];
}

export function createAcpProxyHandler(deps: AcpProxyDeps): AcpProxyHandler {
  const { acp, publisher, promptService, sessionStateStore, mcpUrl } = deps;

  function requireLabSessionId(id: string | null): ValidationResult<string> {
    if (!id) {
      return {
        ok: false,
        response: corsResponse(
          JSON.stringify({ error: "Missing X-Lab-Session-Id" }),
          400
        ),
      };
    }
    return { ok: true, value: id };
  }

  async function requireInitializedSession(
    labSessionId: string
  ): Promise<ValidationResult<InitializedSession>> {
    const session = await findSessionById(labSessionId);
    if (!session?.sandboxSessionId) {
      return {
        ok: false,
        response: corsResponse(
          JSON.stringify({ error: "Session not initialized" }),
          400
        ),
      };
    }

    return {
      ok: true,
      value: { session, sandboxSessionId: session.sandboxSessionId },
    };
  }

  type RouteHandler = (
    request: Request,
    labSessionId: string | null,
    url: URL
  ) => Promise<Response>;

  const routeWithSession = (
    handler: (labSessionId: string | null) => Promise<Response>
  ): RouteHandler => {
    return (...routeArgs: Parameters<RouteHandler>) => handler(routeArgs[1]);
  };

  const routeWithSessionAndUrl = (
    handler: (labSessionId: string | null, url: URL) => Promise<Response>
  ): RouteHandler => {
    return (...routeArgs: Parameters<RouteHandler>) =>
      handler(routeArgs[1], routeArgs[2]);
  };

  const staticRoutes = new Map<string, RouteHandler>([
    [
      "POST /sessions",
      (request, labSessionId) => handleCreateSession(request, labSessionId),
    ],
    [
      "POST /messages",
      (request, labSessionId) => handleSendMessage(request, labSessionId),
    ],
    ["POST /cancel", routeWithSession(handleCancelSession)],
    [
      "GET /events",
      (request, labSessionId) => handleStreamEvents(request, labSessionId),
    ],
    ["DELETE /sessions", routeWithSession(handleDeleteSession)],
    ["GET /files/status", routeWithSession(handleFileStatus)],
    ["GET /files/list", routeWithSessionAndUrl(handleFileList)],
    ["GET /files/read", routeWithSessionAndUrl(handleFileRead)],
    ["GET /history", routeWithSession(handleHistory)],
    ["GET /agents", () => handleListAgents()],
    ["GET /models", () => handleListModels()],
  ]);

  function matchStaticRoute(
    path: string,
    method: string
  ): RouteHandler | undefined {
    return staticRoutes.get(`${method} ${path}`);
  }

  function handleRegexRoutes(
    path: string,
    method: string,
    labSessionId: string | null
  ): Promise<Response> | null {
    if (method !== "POST") {
      return null;
    }

    const permissionMatch = path.match(PERMISSION_REPLY_PATTERN);
    if (permissionMatch?.[1]) {
      return handlePermissionReply();
    }

    const questionReplyMatch = path.match(QUESTION_REPLY_PATTERN);
    if (questionReplyMatch?.[1]) {
      return handleQuestionReply(labSessionId);
    }

    const questionRejectMatch = path.match(QUESTION_REJECT_PATTERN);
    if (questionRejectMatch?.[1]) {
      return handleQuestionReject(labSessionId);
    }

    return null;
  }

  return function handleProxy(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(PATH_PREFIX, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");

    widelog.set("sandbox_agent.proxy_path", path);
    widelog.set("sandbox_agent.has_lab_session_id", Boolean(labSessionId));
    if (labSessionId) {
      widelog.set("session_id", labSessionId);
    }

    const staticHandler = matchStaticRoute(path, request.method);
    if (staticHandler) {
      return staticHandler(request, labSessionId, url);
    }

    const regexResult = handleRegexRoutes(path, request.method, labSessionId);
    if (regexResult) {
      return regexResult;
    }

    return Promise.resolve(
      corsResponse(JSON.stringify({ error: "Not found" }), 404)
    );
  };

  async function handleCreateSession(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    try {
      const session = await findSessionById(validated.value);

      if (session?.sandboxSessionId) {
        return corsResponse(
          JSON.stringify({ id: session.sandboxSessionId }),
          200
        );
      }

      const body = await safeJsonBody(request);
      const model = typeof body.model === "string" ? body.model : undefined;

      const systemPrompt = await buildSystemPrompt(
        validated.value,
        session?.projectId ?? ""
      );

      const workspaceDir =
        session?.workspaceDirectory ??
        (await resolveWorkspacePathBySession(validated.value));
      const mcpServers = buildMcpServers(mcpUrl, validated.value);

      const sandboxSessionId = await acp.createSession(validated.value, {
        cwd: workspaceDir,
        mcpServers,
        model,
        systemPrompt: systemPrompt ?? undefined,
      });

      await updateSessionFields(validated.value, {
        sandboxSessionId,
        workspaceDirectory: workspaceDir,
      });

      return corsResponse(JSON.stringify({ id: sandboxSessionId }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to create session: ${message}` }),
        500
      );
    }
  }

  async function handleSendMessage(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const body = await safeJsonBody(request);
    const messageText = typeof body.message === "string" ? body.message : "";

    if (!messageText) {
      return corsResponse(JSON.stringify({ error: "Missing message" }), 400);
    }

    try {
      await acp.sendMessage(validated.value, messageText);

      await sessionStateStore.setLastMessage(validated.value, messageText);
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: validated.value },
        { lastMessage: messageText }
      );

      return corsResponse(JSON.stringify({ success: true }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to send message: ${message}` }),
        500
      );
    }
  }

  async function handleStreamEvents(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const currentLabSessionId = validated.value;
    const encoder = new TextEncoder();

    const startSeq = (await getMaxSequence(currentLabSessionId)) + 1;
    let eventIndex = startSeq;

    const stream = new ReadableStream({
      start(controller) {
        const unsubscribe = acp.onSessionEvent(
          currentLabSessionId,
          (envelope) => {
            const seq = eventIndex++;
            const frame = `id: ${seq}\ndata: ${JSON.stringify(envelope)}\n\n`;
            try {
              controller.enqueue(encoder.encode(frame));
            } catch (error) {
              unsubscribe();
              if (!(error instanceof TypeError)) {
                throw error;
              }
            }

            persistAndBroadcastEvent(currentLabSessionId, seq, envelope);
          }
        );

        request.signal.addEventListener(
          "abort",
          () => {
            unsubscribe();
            controller.close();
          },
          { once: true }
        );
      },
      cancel() {
        return undefined;
      },
    });

    return buildSseResponse(stream, 200);
  }

  async function persistAndBroadcastEvent(
    sessionId: string,
    sequence: number,
    envelope: unknown
  ): Promise<void> {
    try {
      await storeAgentEvent(sessionId, sequence, envelope);

      const parsedTodoEvent = extractTodoEvent(envelope);
      if (!parsedTodoEvent) {
        return;
      }

      const taskRows = mapToTaskRows(parsedTodoEvent);
      await replaceSessionTasks(sessionId, taskRows);

      const snapshot = await findSessionTasks(sessionId);
      publisher.publishSnapshot("sessionTasks", { uuid: sessionId }, snapshot);
    } catch (error) {
      widelog.context(() => {
        widelog.set("event_name", "acp.event_persist_failed");
        widelog.set("session_id", sessionId);
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        widelog.flush();
      });
    }
  }

  async function handleCancelSession(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    try {
      await acp.cancelPrompt(validated.value);
      return corsResponse(JSON.stringify({ success: true }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to cancel prompt: ${message}` }),
        500
      );
    }
  }

  async function handleDeleteSession(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (session?.sandboxSessionId) {
      await acp.destroySession(validated.value);
    }

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  function handlePermissionReply(): Promise<Response> {
    return Promise.resolve(
      corsResponse(JSON.stringify({ success: true }), 200)
    );
  }

  async function handleQuestionReply(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handleQuestionReject(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handleFileStatus(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (!session?.sandboxSessionId) {
      return corsResponse(
        JSON.stringify({ error: "Session not initialized" }),
        400
      );
    }

    try {
      const events = await getAgentEvents(validated.value);
      const changedFiles = extractChangedFilesFromStoredEvents(events);
      return corsResponse(JSON.stringify(changedFiles), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to fetch file status: ${message}` }),
        500
      );
    }
  }

  async function handleFileList(
    labSessionId: string | null,
    url: URL
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (!session?.sandboxSessionId) {
      return corsResponse(
        JSON.stringify({ error: "Session not initialized" }),
        400
      );
    }

    const requestedPath = url.searchParams.get("path") ?? ".";
    const resolvedPath = resolveWorkspacePath(
      session.workspaceDirectory,
      requestedPath
    );

    try {
      const entries = await acp.listFsEntries({
        path: resolvedPath,
      });

      const workspacePrefix = session.workspaceDirectory
        ? `${session.workspaceDirectory}/`
        : "";
      const nodes = entries.map((entry) => ({
        name: entry.name,
        path:
          workspacePrefix && entry.path.startsWith(workspacePrefix)
            ? entry.path.slice(workspacePrefix.length)
            : entry.path,
        type: entry.entryType === "directory" ? "directory" : "file",
      }));

      return corsResponse(JSON.stringify(nodes), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to list files: ${message}` }),
        500
      );
    }
  }

  async function handleFileRead(
    labSessionId: string | null,
    url: URL
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session } = sessionResult.value;

    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return corsResponse(JSON.stringify({ error: "Missing path" }), 400);
    }

    const resolvedFilePath = resolveWorkspacePath(
      session.workspaceDirectory,
      filePath
    );

    try {
      const contentBytes = await acp.readFsFile({
        path: resolvedFilePath,
      });
      const content = new TextDecoder().decode(contentBytes);
      return corsResponse(
        JSON.stringify({ type: "text", content, patch: null }),
        200
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to read file: ${message}` }),
        500
      );
    }
  }

  async function handleListAgents(): Promise<Response> {
    try {
      const response = await acp.listAgents();
      const agents = (response.agents ?? []).map((agent) => {
        const capabilities = isEventRecord(agent.capabilities)
          ? agent.capabilities
          : {};

        return {
          id: String(agent.id ?? ""),
          name: String(agent.name ?? ""),
          installed: Boolean(agent.installed),
          capabilities: {
            permissions: Boolean(capabilities.permissions),
            questions: Boolean(capabilities.questions),
          },
        };
      });
      return corsResponse(JSON.stringify(agents), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to list agents: ${message}` }),
        500
      );
    }
  }

  async function handleHistory(labSessionId: string | null): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    try {
      const events = await getAgentEvents(validated.value);
      return corsResponse(JSON.stringify(events), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to fetch history: ${message}` }),
        500
      );
    }
  }

  async function handleListModels(): Promise<Response> {
    try {
      const agentInfo = await acp.getAgent("claude", { config: true });
      const configOptions = getConfigOptions(agentInfo);

      const modelConfig = configOptions?.find(
        (opt) => opt.category === "model"
      );
      const models = (modelConfig?.options ?? []).map((opt) => ({
        id: opt.value,
        name: opt.name,
      }));
      return corsResponse(JSON.stringify(models), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to list models: ${message}` }),
        500
      );
    }
  }

  async function buildSystemPrompt(
    labSessionId: string,
    projectId: string
  ): Promise<string | null> {
    try {
      const projectPrompt = await getProjectSystemPrompt(projectId);
      const { text } = promptService.compose({
        sessionId: labSessionId,
        projectId,
        projectSystemPrompt: projectPrompt,
      });
      return text || null;
    } catch (error) {
      widelog.context(() => {
        widelog.set("event_name", "sandbox_agent.build_system_prompt_error");
        widelog.set("session_id", labSessionId);
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        widelog.flush();
      });
      return null;
    }
  }
}

interface ChangedFileInfo {
  path: string;
  status: "added" | "modified";
  added: number;
  removed: number;
}

function processToolCallPart(
  part: Record<string, unknown>,
  fileMap: Map<string, ChangedFileInfo>
): void {
  if (typeof part !== "object" || part === null || part.type !== "tool_call") {
    return;
  }

  const toolName = getString(part.name);
  if (toolName !== "Write" && toolName !== "Edit") {
    return;
  }

  try {
    const args = JSON.parse(
      typeof part.arguments === "string" ? part.arguments : "{}"
    );
    const filePath = getString(args.file_path);
    if (!filePath) {
      return;
    }

    const normalizedPath = filePath.startsWith("/")
      ? filePath.slice(1)
      : filePath;

    const existing = fileMap.get(normalizedPath);
    if (existing) {
      existing.status = "modified";
    } else {
      fileMap.set(normalizedPath, {
        path: normalizedPath,
        status: toolName === "Write" ? "added" : "modified",
        added: 0,
        removed: 0,
      });
    }
  } catch (error) {
    widelog.set(
      "sandbox_agent.parse_tool_args_error",
      error instanceof Error ? error.message : "Unknown"
    );
  }
}

function extractChangedFilesFromStoredEvents(
  events: { sequence: number; eventData: unknown }[]
): ChangedFileInfo[] {
  const fileMap = new Map<string, ChangedFileInfo>();

  for (const event of events) {
    const data = event.eventData;
    if (!isEventRecord(data)) {
      continue;
    }

    const method = data.method;
    const params = data.params;

    if (typeof method !== "string" || !isEventRecord(params)) {
      continue;
    }

    const update = params.update;
    if (!isEventRecord(update)) {
      continue;
    }

    if (
      update.sessionUpdate !== "item_completed" &&
      method !== "item.completed"
    ) {
      continue;
    }

    const content = resolveEventContent(update, params);

    for (const part of content) {
      if (isEventRecord(part)) {
        processToolCallPart(part, fileMap);
      }
    }
  }

  return [...fileMap.values()];
}

function resolveEventContent(
  update: Record<string, unknown>,
  params: Record<string, unknown>
): unknown[] {
  if (Array.isArray(update.content)) {
    return update.content;
  }

  if (Array.isArray(params.content)) {
    return params.content;
  }

  return [];
}

function isEventRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getConfigOptions(agentInfo: Record<string, unknown>): Array<{
  category: string;
  options?: Array<{ name: string; value: string }>;
}> {
  const rawConfigOptions = agentInfo.configOptions;
  if (!Array.isArray(rawConfigOptions)) {
    return [];
  }

  return rawConfigOptions.flatMap((option) => {
    if (!isEventRecord(option) || typeof option.category !== "string") {
      return [];
    }

    const options = Array.isArray(option.options)
      ? option.options.flatMap((configValue) => {
          if (
            !isEventRecord(configValue) ||
            typeof configValue.name !== "string" ||
            typeof configValue.value !== "string"
          ) {
            return [];
          }
          return [{ name: configValue.name, value: configValue.value }];
        })
      : undefined;

    return [{ category: option.category, options }];
  });
}
