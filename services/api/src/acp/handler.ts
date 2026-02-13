import type { Session } from "@lab/database/schema/sessions";
import { buildSseResponse, CORS_HEADERS } from "@lab/http-utilities";
import type { NewSessionRequest } from "acp-http-client";
import { widelog } from "../logging";
import { upsertReplayCheckpoint } from "../repositories/acp-replay-checkpoint.repository";
import {
  getAgentEvents,
  getMaxSequence,
} from "../repositories/agent-event.repository";
import { getWorkspaceContainerRuntimeId } from "../repositories/container-session.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import {
  INFERENCE_STATUS,
  type SessionStateStore,
} from "../state/session-state-store";
import type { Publisher, Sandbox } from "../types/dependencies";
import type { PromptService } from "../types/prompt";
import type { AcpClient } from "./client";
import { CURRENT_REPLAY_PARSER_VERSION } from "./replay-checkpoint";

type AcpProxyHandler = (request: Request, url: URL) => Promise<Response>;

interface AcpProxyDeps {
  acp: AcpClient;
  publisher: Publisher;
  sandbox: Sandbox;
  promptService: PromptService;
  sessionStateStore: SessionStateStore;
  ensureSessionMonitor?: (sessionId: string) => void;
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

const SEND_MESSAGE_TIMEOUT_MS = 45_000;
const MAX_SEND_MESSAGE_ATTEMPTS = 3;

function isRecoverableAcpSendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  const recoverablePatterns = [
    "request failed with status 500",
    "agent process exited",
    "no session for server",
    "process stdin not available",
    "timed out",
    "no conversation found",
    "session not found",
    "session did not end in result",
    "processtransport is not ready for writing",
  ];

  return recoverablePatterns.some((pattern) => message.includes(pattern));
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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

const PATH_PREFIX = /^\/acp/;
const PERMISSION_REPLY_PATTERN = /^\/permissions\/([^/]+)\/reply$/;
const QUESTION_REPLY_PATTERN = /^\/questions\/([^/]+)\/reply$/;
const QUESTION_REJECT_PATTERN = /^\/questions\/([^/]+)\/reject$/;
const LEADING_SLASHES_REGEX = /^\/+/;
const TRAILING_SLASHES_REGEX = /\/+$/;

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
  const {
    acp,
    publisher,
    sandbox,
    promptService,
    sessionStateStore,
    ensureSessionMonitor,
    mcpUrl,
  } = deps;

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

  async function ensureAcpSession(
    labSessionId: string,
    session: Session
  ): Promise<string> {
    if (acp.hasSession(labSessionId) && session.sandboxSessionId) {
      return session.sandboxSessionId;
    }

    const workspaceDir =
      session.workspaceDirectory ??
      (await resolveWorkspacePathBySession(labSessionId));
    const systemPrompt = await buildSystemPrompt(
      labSessionId,
      session.projectId ?? ""
    );
    const mcpServers = buildMcpServers(mcpUrl, labSessionId);

    const sandboxSessionId = await acp.createSession(labSessionId, {
      cwd: workspaceDir,
      mcpServers,
      model: undefined,
      systemPrompt: systemPrompt ?? undefined,
      loadSessionId: session.sandboxSessionId ?? undefined,
    });

    if (session.sandboxSessionId !== sandboxSessionId) {
      await updateSessionFields(labSessionId, {
        sandboxSessionId,
        workspaceDirectory: workspaceDir,
      });
    }

    return sandboxSessionId;
  }

  async function resetAcpSessionForRetry(
    labSessionId: string,
    session: Session
  ): Promise<Session> {
    await acp.destroySession(labSessionId);
    await updateSessionFields(labSessionId, {
      sandboxSessionId: null,
    });
    return { ...session, sandboxSessionId: null };
  }

  async function sendMessageWithRecovery(
    labSessionId: string,
    session: Session,
    messageText: string,
    modelId?: string
  ): Promise<void> {
    let currentSession = session;

    for (
      let attemptIndex = 0;
      attemptIndex < MAX_SEND_MESSAGE_ATTEMPTS;
      attemptIndex++
    ) {
      try {
        await withTimeout(
          ensureAcpSession(labSessionId, currentSession),
          SEND_MESSAGE_TIMEOUT_MS,
          "ACP session initialization"
        );
        if (modelId) {
          await withTimeout(
            acp.setSessionModel(labSessionId, modelId),
            SEND_MESSAGE_TIMEOUT_MS,
            "ACP set session model"
          );
        }
        await withTimeout(
          acp.sendMessage(labSessionId, messageText),
          SEND_MESSAGE_TIMEOUT_MS,
          "ACP send message"
        );
        return;
      } catch (error) {
        const isFinalAttempt = attemptIndex === MAX_SEND_MESSAGE_ATTEMPTS - 1;
        if (isFinalAttempt || !isRecoverableAcpSendError(error)) {
          throw error;
        }

        currentSession = await resetAcpSessionForRetry(
          labSessionId,
          currentSession
        );
      }
    }
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
    ["POST /model", (request, labSessionId) => handleSetModel(request, labSessionId)],
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
    [
      "POST /replay-checkpoint",
      (request, labSessionId) => handleReplayCheckpoint(request, labSessionId),
    ],
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

    const initialSession = await findSessionById(validated.value);
    if (!initialSession) {
      return corsResponse(JSON.stringify({ error: "Session not found" }), 404);
    }
    const body = await safeJsonBody(request);
    const messageText = typeof body.message === "string" ? body.message : "";
    const modelId = typeof body.model === "string" ? body.model.trim() : "";

    if (!messageText) {
      return corsResponse(JSON.stringify({ error: "Missing message" }), 400);
    }

    try {
      ensureSessionMonitor?.(validated.value);
      await sessionStateStore.setInferenceStatus(
        validated.value,
        INFERENCE_STATUS.GENERATING
      );
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: validated.value },
        { inferenceStatus: INFERENCE_STATUS.GENERATING }
      );

      await sendMessageWithRecovery(
        validated.value,
        initialSession,
        messageText,
        modelId || undefined
      );

      await sessionStateStore.setLastMessage(validated.value, messageText);
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: validated.value },
        { lastMessage: messageText }
      );

      return corsResponse(JSON.stringify({ success: true }), 200);
    } catch (error) {
      await sessionStateStore.setInferenceStatus(
        validated.value,
        INFERENCE_STATUS.IDLE
      );
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: validated.value },
        { inferenceStatus: INFERENCE_STATUS.IDLE }
      );

      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to send message: ${message}` }),
        500
      );
    }
  }

  async function handleSetModel(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (!session) {
      return corsResponse(JSON.stringify({ error: "Session not found" }), 404);
    }

    const body = await safeJsonBody(request);
    const model =
      typeof body.model === "string" ? body.model.trim() : "";

    if (!model) {
      return corsResponse(JSON.stringify({ error: "Missing model" }), 400);
    }

    try {
      await withTimeout(
        ensureAcpSession(validated.value, session),
        SEND_MESSAGE_TIMEOUT_MS,
        "ACP session initialization"
      );
      await acp.setSessionModel(validated.value, model);
      return corsResponse(JSON.stringify({ success: true, model }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to set model: ${message}` }),
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
      const workspaceDirectory =
        session.workspaceDirectory ??
        (await resolveWorkspacePathBySession(validated.value));

      const changedFilesFromWorkspace = await extractChangedFilesFromWorkspace(
        validated.value,
        session,
        sandbox
      );
      if (changedFilesFromWorkspace) {
        return corsResponse(
          JSON.stringify(
            toClientChangedFiles(changedFilesFromWorkspace, workspaceDirectory)
          ),
          200
        );
      }

      const events = await getAgentEvents(validated.value);
      const changedFiles = extractChangedFilesFromStoredEvents(events);
      return corsResponse(
        JSON.stringify(toClientChangedFiles(changedFiles, workspaceDirectory)),
        200
      );
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

  async function handleReplayCheckpoint(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const body = await safeJsonBody(request);
    const parserVersion =
      typeof body.parserVersion === "number" ? body.parserVersion : null;
    const lastSequence =
      typeof body.lastSequence === "number" ? body.lastSequence : null;
    const replayState = isEventRecord(body.replayState)
      ? body.replayState
      : null;

    if (parserVersion === null || lastSequence === null || !replayState) {
      return corsResponse(
        JSON.stringify({ error: "Invalid replay checkpoint payload" }),
        400
      );
    }

    if (parserVersion !== CURRENT_REPLAY_PARSER_VERSION) {
      return corsResponse(
        JSON.stringify({ error: "Unsupported replay parser version" }),
        400
      );
    }

    await upsertReplayCheckpoint(validated.value, {
      parserVersion,
      lastSequence,
      replayState,
    });

    return corsResponse(JSON.stringify({ success: true }), 200);
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
  status: "added" | "modified" | "deleted";
  added: number;
  removed: number;
}

function toWorkspaceRelativePath(
  filePath: string,
  workspaceDirectory: string | null | undefined
): string {
  const normalizedPath = filePath.replace(LEADING_SLASHES_REGEX, "");
  if (!workspaceDirectory) {
    return normalizedPath;
  }

  const normalizedWorkspace = workspaceDirectory
    .replace(LEADING_SLASHES_REGEX, "")
    .replace(TRAILING_SLASHES_REGEX, "");

  if (normalizedPath === normalizedWorkspace) {
    return ".";
  }

  const workspacePrefix = `${normalizedWorkspace}/`;
  if (normalizedPath.startsWith(workspacePrefix)) {
    return normalizedPath.slice(workspacePrefix.length);
  }

  return normalizedPath;
}

function toClientChangedFiles(
  files: ChangedFileInfo[],
  workspaceDirectory: string | null | undefined
): ChangedFileInfo[] {
  return files.map((file) => ({
    ...file,
    path: toWorkspaceRelativePath(file.path, workspaceDirectory),
  }));
}

function normalizeGitPath(path: string): string {
  if (path.startsWith("./")) {
    return path.slice(2);
  }
  return path.startsWith("/") ? path.slice(1) : path;
}

function parseGitStatusLine(
  line: string
): { path: string; status: ChangedFileInfo["status"] } | null {
  if (line.length < 4) {
    return null;
  }

  const xy = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  if (!rawPath) {
    return null;
  }

  const path = normalizeGitPath(
    rawPath.includes(" -> ")
      ? (rawPath.split(" -> ").at(-1) ?? rawPath)
      : rawPath
  );

  const [x, y] = xy;
  if (x === "D" || y === "D") {
    return { path, status: "deleted" };
  }

  if (x === "A" || y === "A" || xy === "??") {
    return { path, status: "added" };
  }

  return { path, status: "modified" };
}

async function extractChangedFilesFromWorkspace(
  sessionId: string,
  session: Session,
  sandbox: Sandbox
): Promise<ChangedFileInfo[] | null> {
  const workspace = await getWorkspaceContainerRuntimeId(sessionId);
  if (!workspace?.runtimeId) {
    return null;
  }

  const workdir =
    session.workspaceDirectory ??
    (await resolveWorkspacePathBySession(sessionId));

  const result = await sandbox.provider.exec(workspace.runtimeId, {
    command: ["sh", "-lc", "git status --porcelain=v1 --untracked-files=all"],
    workdir,
  });

  if (result.exitCode !== 0) {
    return null;
  }

  const fileMap = new Map<string, ChangedFileInfo>();
  for (const line of result.stdout.split("\n")) {
    const parsed = parseGitStatusLine(line.trimEnd());
    if (!parsed) {
      continue;
    }
    applyChangedFile(fileMap, parsed.path, parsed.status);
  }

  return [...fileMap.values()];
}

function toEventRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function normalizeToolName(name: string): string {
  const lower = name.trim().toLowerCase();
  const unscoped = lower.includes("__")
    ? (lower.split("__").at(-1) ?? lower)
    : lower;
  return unscoped.replace(/[^a-z0-9]/g, "");
}

function readFilePath(input: Record<string, unknown>): string | null {
  const candidates = [
    input.filePath,
    input.file_path,
    input.path,
    input.targetPath,
    input.target_path,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      const record = toEventRecord(parsed);
      return record ?? {};
    } catch {
      return {};
    }
  }

  return toEventRecord(value) ?? {};
}

function applyChangedFile(
  fileMap: Map<string, ChangedFileInfo>,
  filePath: string,
  status: ChangedFileInfo["status"]
): void {
  const normalizedPath = filePath.startsWith("/")
    ? filePath.slice(1)
    : filePath;
  const existing = fileMap.get(normalizedPath);

  if (existing) {
    existing.status = status === "deleted" ? "deleted" : "modified";
    return;
  }

  fileMap.set(normalizedPath, {
    path: normalizedPath,
    status,
    added: 0,
    removed: 0,
  });
}

function processToolCallUpdate(
  update: Record<string, unknown>,
  fileMap: Map<string, ChangedFileInfo>
): void {
  const meta = toEventRecord(update._meta);
  const claudeCode = meta ? toEventRecord(meta.claudeCode) : null;
  const toolNameRaw =
    (typeof claudeCode?.toolName === "string" ? claudeCode.toolName : null) ??
    (typeof update.toolName === "string" ? update.toolName : null);
  if (!toolNameRaw) {
    return;
  }

  const toolName = normalizeToolName(toolNameRaw);
  const isWriteTool = toolName === "write";
  const isEditTool = toolName === "edit" || toolName === "patch";
  const isDeleteTool = toolName === "delete" || toolName === "rm";

  if (!(isWriteTool || isEditTool || isDeleteTool)) {
    return;
  }

  const args = parseToolArguments(update.rawInput ?? update.input);
  const filePath = readFilePath(args);
  if (!filePath) {
    return;
  }

  let status: ChangedFileInfo["status"] = "modified";
  if (isDeleteTool) {
    status = "deleted";
  } else if (isWriteTool) {
    status = "added";
  }

  applyChangedFile(fileMap, filePath, status);
}

function processToolCallPart(
  part: Record<string, unknown>,
  fileMap: Map<string, ChangedFileInfo>
): void {
  if (typeof part !== "object" || part === null || part.type !== "tool_call") {
    return;
  }

  const rawToolName =
    typeof part.name === "string" && part.name.length > 0 ? part.name : "";
  const toolName = normalizeToolName(rawToolName);
  const isWriteTool = toolName === "write";
  const isEditTool = toolName === "edit" || toolName === "patch";
  const isDeleteTool = toolName === "delete" || toolName === "rm";

  if (!(isWriteTool || isEditTool || isDeleteTool)) {
    return;
  }

  const args = parseToolArguments(part.arguments ?? part.input);
  const filePath = readFilePath(args);
  if (!filePath) {
    return;
  }

  let status: ChangedFileInfo["status"] = "modified";
  if (isDeleteTool) {
    status = "deleted";
  } else if (isWriteTool) {
    status = "added";
  }

  applyChangedFile(fileMap, filePath, status);
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
    if (isEventRecord(update)) {
      const sessionUpdate = update.sessionUpdate;
      if (
        sessionUpdate === "tool_call" ||
        sessionUpdate === "tool_call_update" ||
        sessionUpdate === "item_completed"
      ) {
        processToolCallUpdate(update, fileMap);
      }
    }

    const content = resolveEventContent(
      isEventRecord(update) ? update : {},
      params
    );

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
