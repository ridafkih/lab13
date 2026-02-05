import { CORS_HEADERS, buildSseResponse } from "@lab/http-utilities";
import { createPromptContext } from "../prompts/context";
import type { PromptService } from "../types/prompt";
import { findSessionById, updateSessionFields } from "../repositories/session.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import { widelog } from "../logging";

const PROMPT_ENDPOINTS = ["/session/", "/prompt", "/message"];
const QUESTION_ENDPOINTS = ["/question/"];

async function safeJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function shouldInjectSystemPrompt(path: string, method: string): boolean {
  return method === "POST" && PROMPT_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

function isQuestionRequest(path: string, method: string): boolean {
  return method === "POST" && QUESTION_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

function isSessionCreateRequest(path: string, method: string): boolean {
  return method === "POST" && path === "/session";
}

function extractUserMessageText(body: Record<string, unknown>): string | null {
  const parts = body.parts;
  if (!Array.isArray(parts)) return null;

  const textPart = parts.find(
    (part): part is { type: string; text: string } =>
      typeof part === "object" &&
      part !== null &&
      part.type === "text" &&
      typeof part.text === "string",
  );

  return textPart?.text ?? null;
}

async function getSessionData(labSessionId: string) {
  const session = await findSessionById(labSessionId);
  if (!session) return null;

  const systemPrompt = await getProjectSystemPrompt(session.projectId);

  return {
    sessionId: labSessionId,
    projectId: session.projectId,
    projectSystemPrompt: systemPrompt,
  };
}

function buildForwardHeaders(request: Request): Headers {
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("X-Lab-Session-Id");
  forwardHeaders.delete("host");
  return forwardHeaders;
}

function buildStandardResponse(proxyResponse: Response): Response {
  const responseHeaders = new Headers(proxyResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }
  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
}

function isSseResponse(path: string, proxyResponse: Response): boolean {
  return (
    path.includes("/event") ||
    proxyResponse.headers.get("content-type")?.includes("text/event-stream") === true
  );
}

async function handleSessionCreateResponse(
  proxyResponse: Response,
  labSessionId: string,
  workspacePath: string,
): Promise<Response> {
  if (!proxyResponse.ok) {
    return buildStandardResponse(proxyResponse);
  }

  const responseBody = await proxyResponse.json();
  const opencodeSessionId = responseBody?.id;

  if (opencodeSessionId) {
    await updateSessionFields(labSessionId, {
      opencodeSessionId,
      workspaceDirectory: workspacePath,
    });
  }

  const responseHeaders = new Headers(proxyResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }
  return new Response(JSON.stringify(responseBody), {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
}

function createAbortableStream(
  upstream: ReadableStream<Uint8Array> | null,
  abortController: AbortController,
): ReadableStream<Uint8Array> | null {
  if (!upstream) return null;

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      abortController.abort();
    },
  });
}

export type OpenCodeProxyHandler = (request: Request, url: URL) => Promise<Response>;

export interface OpenCodeProxyDeps {
  opencodeUrl: string;
  publisher: Publisher;
  promptService: PromptService;
  sessionStateStore: SessionStateStore;
}

export function createOpenCodeProxyHandler(deps: OpenCodeProxyDeps): OpenCodeProxyHandler {
  const { opencodeUrl, publisher, promptService, sessionStateStore } = deps;

  async function buildProxyBody(
    request: Request,
    path: string,
    labSessionId: string | null,
    workspacePath: string | null,
  ): Promise<{ body: BodyInit | null; userMessageText: string | null }> {
    const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
    if (!hasBody) return { body: null, userMessageText: null };

    const isSessionCreate = isSessionCreateRequest(path, request.method);
    if (labSessionId && isSessionCreate && workspacePath) {
      const originalBody = await safeJsonBody(request);
      return {
        body: JSON.stringify({ ...originalBody, directory: workspacePath }),
        userMessageText: null,
      };
    }

    // Handle question reply/reject - inject directory
    const isQuestion = isQuestionRequest(path, request.method);
    if (labSessionId && isQuestion && workspacePath) {
      const originalBody = await safeJsonBody(request);
      return {
        body: JSON.stringify({ ...originalBody, directory: workspacePath }),
        userMessageText: null,
      };
    }

    const isPromptEndpoint = shouldInjectSystemPrompt(path, request.method);
    if (!labSessionId || !isPromptEndpoint) {
      widelog.set("opencode.prompt_injection.skipped", true);
      widelog.set("opencode.prompt_injection.session_present", Boolean(labSessionId));
      widelog.set("opencode.prompt_injection.endpoint_match", isPromptEndpoint);
      return { body: request.body, userMessageText: null };
    }

    const originalBody = await safeJsonBody(request);

    const userMessageText = extractUserMessageText(originalBody);

    const sessionData = await getSessionData(labSessionId);
    if (!sessionData) {
      widelog.set("opencode.prompt_injection.session_data_found", false);
      return {
        body: JSON.stringify({ ...originalBody, directory: workspacePath }),
        userMessageText,
      };
    }

    const promptContext = createPromptContext({
      sessionId: sessionData.sessionId,
      projectId: sessionData.projectId,
      projectSystemPrompt: sessionData.projectSystemPrompt,
    });

    const { text: composedPrompt, includedFragments } = promptService.compose(promptContext);
    widelog.set("opencode.prompt_injection.session_data_found", true);
    widelog.set("opencode.prompt_injection.prompt_length", composedPrompt?.length ?? 0);
    widelog.set("opencode.prompt_injection.fragment_count", includedFragments.length);
    for (const fragment of includedFragments) {
      widelog.append("opencode.prompt_injection.fragments", fragment);
    }

    const existingTools =
      originalBody.tools && typeof originalBody.tools === "object" ? originalBody.tools : {};
    const tools = { ...existingTools, bash: false };

    if (!composedPrompt) {
      return {
        body: JSON.stringify({
          ...originalBody,
          directory: workspacePath,
          tools,
        }),
        userMessageText,
      };
    }

    const existingSystem = originalBody.system ?? "";
    const combinedSystem = composedPrompt + (existingSystem ? "\n\n" + existingSystem : "");

    return {
      body: JSON.stringify({
        ...originalBody,
        system: combinedSystem,
        directory: workspacePath,
        tools,
      }),
      userMessageText,
    };
  }

  function buildTargetUrl(path: string, url: URL, workspacePath: string | null): string {
    const targetParams = new URLSearchParams(url.search);
    if (workspacePath) {
      targetParams.set("directory", workspacePath);
    }
    const queryString = targetParams.toString();
    return `${opencodeUrl}${path}${queryString ? `?${queryString}` : ""}`;
  }

  return async function handleOpenCodeProxy(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/^\/opencode/, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");
    const workspacePath = labSessionId ? await resolveWorkspacePathBySession(labSessionId) : null;
    const targetUrl = buildTargetUrl(path, url, workspacePath);

    widelog.set("opencode.proxy_path", path);
    widelog.set("opencode.has_lab_session_id", Boolean(labSessionId));
    if (labSessionId) {
      widelog.set("session_id", labSessionId);
    }
    widelog.set("opencode.has_workspace_path", Boolean(workspacePath));

    const forwardHeaders = buildForwardHeaders(request);
    const { body, userMessageText } = await buildProxyBody(
      request,
      path,
      labSessionId,
      workspacePath,
    );

    const upstreamAbort = new AbortController();
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: upstreamAbort.signal,
      ...(body ? { duplex: "half" } : {}),
    }).catch((error: unknown) => {
      widelog.errorFields(error, { prefix: "opencode.upstream_error" });
      throw error;
    });

    widelog.set("opencode.upstream_status_code", proxyResponse.status);

    if (userMessageText && proxyResponse.ok && labSessionId) {
      await sessionStateStore.setLastMessage(labSessionId, userMessageText);
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: labSessionId },
        { lastMessage: userMessageText },
      );
    }

    if (isSseResponse(path, proxyResponse)) {
      widelog.set("opencode.response_type", "sse");
      return buildSseResponse(
        createAbortableStream(proxyResponse.body, upstreamAbort),
        proxyResponse.status,
      );
    }

    if (isSessionCreateRequest(path, request.method) && labSessionId && workspacePath) {
      widelog.set("opencode.response_type", "session_create");
      return handleSessionCreateResponse(proxyResponse, labSessionId, workspacePath);
    }

    widelog.set("opencode.response_type", "standard");
    return buildStandardResponse(proxyResponse);
  };
}
