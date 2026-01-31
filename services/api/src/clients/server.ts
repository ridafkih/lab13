import { type WebSocketData } from "@lab/multiplayer-server";
import { type BrowserSessionState } from "@lab/browser-protocol";
import { createWebSocketHandlers, type Auth } from "../utils/handlers/websocket-handler";
import { createOpenCodeProxyHandler } from "../utils/handlers/opencode-handler";
import { createChannelRestHandler } from "../utils/handlers/channel-rest-handler";
import { bootstrapBrowserService, shutdownBrowserService } from "../utils/browser/bootstrap";
import { initializeSessionContainers } from "../utils/docker/containers";
import { isHttpMethod, isRouteModule, type RouteContext } from "../utils/handlers/route-handler";
import { publisher } from "./publisher";
import { join } from "node:path";
import { createDefaultPromptService } from "../utils/prompts/builder";
import { config } from "../config/environment";
import {
  withCors,
  optionsResponse,
  notFoundResponse,
  errorResponse,
  methodNotAllowedResponse,
} from "../shared/http";

const router = new Bun.FileSystemRouter({
  dir: join(import.meta.dirname, "../routes"),
  style: "nextjs",
});

const browserConfig = {
  browserApiUrl: config.browserApiUrl,
  browserWsHost: config.browserWsHost,
  cleanupDelayMs: config.browserCleanupDelayMs,
  reconcileIntervalMs: config.browserReconcileIntervalMs,
  maxRetries: config.browserMaxRetries,
  publishFrame: (sessionId: string, frame: string, timestamp: number) => {
    publisher.publishEvent(
      "sessionBrowserFrames",
      { uuid: sessionId },
      { type: "frame" as const, data: frame, timestamp },
    );
  },
  publishStateChange: (sessionId: string, state: BrowserSessionState) => {
    publisher.publishSnapshot(
      "sessionBrowserState",
      { uuid: sessionId },
      {
        desiredState: state.desiredState,
        currentState: state.currentState,
        streamPort: state.streamPort ?? undefined,
        errorMessage: state.errorMessage ?? undefined,
      },
    );
  },
};

const bootstrap = async () => {
  const browserService = await bootstrapBrowserService(browserConfig);
  const promptService = createDefaultPromptService();
  const handleOpenCodeProxy = createOpenCodeProxyHandler(promptService);

  const routeContext: RouteContext = {
    browserService,
    initializeSessionContainers: (sessionId: string, projectId: string) =>
      initializeSessionContainers(sessionId, projectId, browserService),
    promptService,
  };

  const { websocketHandler, upgrade } = createWebSocketHandlers(browserService);
  const handleChannelRequest = createChannelRestHandler(browserService);

  const server = Bun.serve<WebSocketData<Auth>>({
    port: config.apiPort,
    idleTimeout: 0,
    websocket: websocketHandler,
    async fetch(request): Promise<Response | undefined> {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return optionsResponse();
      }

      if (url.pathname === "/ws") {
        return upgrade(request, server);
      }

      if (url.pathname.startsWith("/opencode/")) {
        return handleOpenCodeProxy(request, url);
      }

      const [, channel] = url.pathname.match(/^\/channels\/([^/]+)\/snapshot$/) ?? [];
      if (channel) {
        return withCors(await handleChannelRequest(channel, url.searchParams));
      }

      const match = router.match(request);

      if (!match) {
        return withCors(notFoundResponse());
      }

      const module: unknown = await import(match.filePath);

      if (!isRouteModule(module)) {
        return withCors(errorResponse());
      }

      if (!isHttpMethod(request.method)) {
        return withCors(methodNotAllowedResponse());
      }

      const handler = module[request.method];

      if (!handler) {
        return withCors(methodNotAllowedResponse());
      }

      const response = await handler(request, match.params, routeContext);
      return withCors(response);
    },
  });

  browserService.startReconciler();

  return { server, browserService };
};

const { server, browserService } = await bootstrap();

export { server, browserService, shutdownBrowserService };
