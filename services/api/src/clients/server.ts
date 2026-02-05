import { createPublisher, type WebSocketData } from "@lab/multiplayer-server";
import { schema } from "@lab/multiplayer-sdk";
import type { Server as BunServer } from "bun";
import type { ImageStore } from "@lab/context";
import { logger } from "../logging";
import { SERVER } from "../config/constants";
import { createWebSocketHandlers, type Auth } from "../websocket/websocket-handler";
import { createOpenCodeProxyHandler } from "../opencode/handler";
import { createChannelRestHandler } from "../snapshots/rest-handler";
import type { PoolManager } from "../managers/pool.manager";
import type { LogMonitor } from "../monitors/log.monitor";
import { reconcileNetworkConnections } from "../runtime/network";
import { isHttpMethod, isRouteModule } from "@lab/router";
import type { RouteContext } from "../types/route";
import { join } from "node:path";
import type { PromptService } from "../types/prompt";
import type { Sandbox, OpencodeClient, Publisher, Widelog } from "../types/dependencies";
import { AppError, ServiceUnavailableError } from "../shared/errors";
import type { BrowserServiceManager } from "../managers/browser-service.manager";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import type { SessionStateStore } from "../state/session-state-store";
import {
  withCors,
  optionsResponse,
  notFoundResponse,
  errorResponse,
  methodNotAllowedResponse,
} from "@lab/http-utilities";

export interface ApiServerConfig {
  proxyBaseDomain: string;
  opencodeUrl: string;
  github: {
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
  };
  frontendUrl?: string;
}

export interface ApiServerServices {
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  logMonitor: LogMonitor;
  sandbox: Sandbox;
  opencode: OpencodeClient;
  promptService: PromptService;
  imageStore?: ImageStore;
  widelog: Widelog;
  sessionStateStore: SessionStateStore;
}

export class ApiServer {
  private server: BunServer<unknown> | null = null;
  private publisher: Publisher | null = null;
  private readonly router = new Bun.FileSystemRouter({
    dir: join(import.meta.dirname, "../routes"),
    style: "nextjs",
  });

  constructor(
    private readonly config: ApiServerConfig,
    private readonly services: ApiServerServices,
  ) {}

  private getServer(): BunServer<unknown> {
    if (!this.server) throw new ServiceUnavailableError("Server not started", "SERVER_NOT_STARTED");
    return this.server;
  }

  private getPublisher(): Publisher {
    if (!this.publisher) {
      throw new ServiceUnavailableError("Server not started", "SERVER_NOT_STARTED");
    }
    return this.publisher;
  }

  async start(port: string): Promise<Publisher> {
    const { proxyBaseDomain, opencodeUrl, github, frontendUrl } = this.config;
    const {
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      sandbox,
      opencode,
      promptService,
      imageStore,
      sessionStateStore,
    } = this.services;

    this.publisher = createPublisher(schema, () => this.getServer());

    const handleOpenCodeProxy = createOpenCodeProxyHandler({
      opencodeUrl,
      publisher: this.publisher,
      promptService,
      sessionStateStore,
    });

    const routeContext: RouteContext = {
      browserService,
      sessionLifecycle,
      poolManager,
      promptService,
      sandbox,
      opencode,
      publisher: this.publisher,
      logMonitor,
      imageStore,
      proxyBaseDomain,
      sessionStateStore,
      githubClientId: github.clientId,
      githubClientSecret: github.clientSecret,
      githubCallbackUrl: github.callbackUrl,
      frontendUrl,
    };

    const { websocketHandler, upgrade } = createWebSocketHandlers({
      browserService: browserService.service,
      publisher: this.publisher,
      opencode,
      logMonitor,
      proxyBaseDomain,
      sessionStateStore,
    });

    const handleChannelRequest = createChannelRestHandler({
      browserService: browserService.service,
      opencode,
      logMonitor,
      proxyBaseDomain,
      sessionStateStore,
    });

    this.server = Bun.serve<WebSocketData<Auth>>({
      port,
      idleTimeout: SERVER.IDLE_TIMEOUT_SECONDS,
      websocket: websocketHandler,
      fetch: async (request): Promise<Response | undefined> => {
        if (request.method === "OPTIONS") {
          return optionsResponse();
        }

        const url = new URL(request.url);

        if (url.pathname === "/ws") {
          return upgrade(request, this.getServer());
        }

        if (url.pathname.startsWith("/opencode/")) {
          return this.handleRequestWithWideEvent(request, url, async () => {
            this.services.widelog.set("route", "opencode_proxy");

            const labSessionId = request.headers.get("X-Lab-Session-Id");
            if (labSessionId) {
              this.services.widelog.set("session_id", labSessionId);
            }

            return handleOpenCodeProxy(request, url);
          });
        }

        const [, channel] = url.pathname.match(/^\/channels\/([^/]+)\/snapshot$/) ?? [];
        if (channel) {
          return this.handleRequestWithWideEvent(request, url, async () => {
            this.services.widelog.set("route", "channel_snapshot");
            this.services.widelog.set("channel_id", channel);
            return withCors(await handleChannelRequest(channel, url.searchParams));
          });
        }

        return this.handleRouteRequest(request, url, routeContext);
      },
    });

    reconcileNetworkConnections(sandbox).catch((error) => {
      const statusCode = error instanceof AppError ? error.statusCode : 500;

      logger.error({
        event_name: "api.server.network_reconciliation_failed",
        status_code: statusCode,
        ...setErrorPayload(error),
      });
    });

    return this.publisher;
  }

  private async handleRouteRequest(
    request: Request,
    url: URL,
    routeContext: RouteContext,
  ): Promise<Response> {
    return this.handleRequestWithWideEvent(request, url, async () => {
      const { widelog } = this.services;
      const match = this.router.match(request);

      if (!match) {
        widelog.set("route", "route_not_found");
        return withCors(notFoundResponse());
      }

      widelog.set("route", match.name);
      for (const [param, value] of Object.entries(match.params)) {
        if (typeof value === "string" && value.length > 0) {
          widelog.set(`route_params.${param}`, value);
        }
      }

      const module: unknown = await import(match.filePath);
      if (!isRouteModule(module)) {
        widelog.set("route_module_valid", false);
        return withCors(errorResponse());
      }

      if (!isHttpMethod(request.method)) {
        widelog.set("method_supported", false);
        return withCors(methodNotAllowedResponse());
      }

      const handler = module[request.method];
      if (!handler) {
        widelog.set("method_implemented", false);
        return withCors(methodNotAllowedResponse());
      }

      return withCors(await handler(request, match.params, routeContext));
    });
  }

  private async handleRequestWithWideEvent(
    request: Request,
    url: URL,
    handler: () => Promise<Response>,
  ): Promise<Response> {
    const { widelog } = this.services;
    const requestId = crypto.randomUUID();

    return widelog.context(async () => {
      widelog.set("request_id", requestId);
      widelog.set("method", request.method);
      widelog.set("path", url.pathname);
      widelog.set("has_query", url.search.length > 0);
      widelog.set("protocol", url.protocol.replace(":", ""));
      const userAgent = request.headers.get("user-agent");
      if (userAgent) {
        widelog.set("user_agent", userAgent);
      }
      widelog.time.start("duration_ms");

      try {
        const response = await handler();
        this.setStatusOutcome(response.status);
        response.headers.set("X-Request-Id", requestId);
        return response;
      } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        const message =
          error instanceof Error && status < 500 ? error.message : "Internal server error";

        this.setStatusOutcome(status);
        widelog.errorFields(error);

        if (error instanceof AppError) {
          widelog.set("error.code", error.code);
        }

        const response = withCors(Response.json({ error: message, requestId }, { status }));
        response.headers.set("X-Request-Id", requestId);
        return response;
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  private setStatusOutcome(statusCode: number): void {
    const { widelog } = this.services;
    widelog.set("status_code", statusCode);
    if (statusCode >= 500) {
      widelog.set("outcome", "error");
      return;
    }

    if (statusCode >= 400) {
      widelog.set("outcome", "client_error");
      return;
    }

    widelog.set("outcome", "success");
  }

  shutdown(): void {
    if (this.server) {
      this.server.stop(true);
      this.server = null;
    }
    this.publisher = null;
    this.services.browserService.shutdown();
  }
}

function setErrorPayload(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return {
      error_name: "Error",
      error_message: error,
    };
  }

  return {
    error_name: "UnknownError",
    error_message: "Unknown error",
  };
}
