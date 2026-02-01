import { config } from "../../config/environment";
import { CORS_HEADERS, buildSseResponse } from "../../shared/http";
import { formatWorkspacePath } from "../../types/session";
import { createPromptContext, type ContainerInfo } from "../prompts/context";
import type { PromptService } from "../../types/prompt";
import { findSessionById } from "../repositories/session.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import { getSessionContainersWithPorts } from "../repositories/container.repository";

const PROMPT_ENDPOINTS = ["/session/", "/prompt", "/message"];

function shouldInjectSystemPrompt(path: string, method: string): boolean {
  return method === "POST" && PROMPT_ENDPOINTS.some((endpoint) => path.includes(endpoint));
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

async function getContainerInfos(sessionId: string): Promise<ContainerInfo[]> {
  return getSessionContainersWithPorts(sessionId);
}

async function buildProxyBody(
  request: Request,
  path: string,
  labSessionId: string | null,
  promptService: PromptService,
): Promise<BodyInit | null> {
  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
  if (!hasBody) return null;

  if (!labSessionId || !shouldInjectSystemPrompt(path, request.method)) {
    return request.body;
  }

  const sessionData = await getSessionData(labSessionId);
  if (!sessionData) return request.body;

  const containers = await getContainerInfos(labSessionId);
  const promptContext = createPromptContext({
    sessionId: sessionData.sessionId,
    projectId: sessionData.projectId,
    containers,
    projectSystemPrompt: sessionData.projectSystemPrompt,
  });

  const { text: composedPrompt } = promptService.compose(promptContext);
  if (!composedPrompt) return request.body;

  const originalBody = await request.json();
  const existingSystem = originalBody.system ?? "";
  const combinedSystem = composedPrompt + (existingSystem ? "\n\n" + existingSystem : "");

  return JSON.stringify({ ...originalBody, system: combinedSystem });
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

function buildTargetUrl(path: string, url: URL, labSessionId: string | null): string {
  const targetParams = new URLSearchParams(url.search);
  if (labSessionId) {
    targetParams.set("directory", formatWorkspacePath(labSessionId));
  }
  const queryString = targetParams.toString();
  return `${config.opencodeUrl}${path}${queryString ? `?${queryString}` : ""}`;
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

export function createOpenCodeProxyHandler(promptService: PromptService): OpenCodeProxyHandler {
  return async function handleOpenCodeProxy(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/^\/opencode/, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");
    const targetUrl = buildTargetUrl(path, url, labSessionId);

    const forwardHeaders = buildForwardHeaders(request);
    const body = await buildProxyBody(request, path, labSessionId, promptService);

    const upstreamAbort = new AbortController();
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: upstreamAbort.signal,
      ...(body ? { duplex: "half" } : {}),
    });

    if (isSseResponse(path, proxyResponse)) {
      return buildSseResponse(
        createAbortableStream(proxyResponse.body, upstreamAbort),
        proxyResponse.status,
      );
    }

    return buildStandardResponse(proxyResponse);
  };
}
