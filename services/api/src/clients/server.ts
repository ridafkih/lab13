const CHANNEL_SNAPSHOT_PATTERN = /^\/channels\/([^/]+)\/snapshot$/;

import { join } from "node:path";
import type { ImageStore } from "@lab/context";
import {
  errorResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  optionsResponse,
  withCors,
} from "@lab/http-utilities";
import { schema } from "@lab/multiplayer-sdk";
import { createPublisher, type WebSocketData } from "@lab/multiplayer-server";
import { isHttpMethod, isRouteModule } from "@lab/router";
import { type Server as BunServer, FileSystemRouter, serve } from "bun";
import type { Auth as BetterAuthInstance } from "../auth";
import { SERVER } from "../config/constants";
import { widelog } from "../logging";
import type { BrowserServiceManager } from "../managers/browser-service.manager";
import type { PoolManager } from "../managers/pool.manager";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import type { LogMonitor } from "../monitors/log.monitor";
import { createOpenCodeProxyHandler } from "../opencode/handler";
import { reconcileNetworkConnections } from "../runtime/network";
import { AppError, ServiceUnavailableError } from "../shared/errors";
import { createChannelRestHandler } from "../snapshots/rest-handler";
import type { SessionStateStore } from "../state/session-state-store";
import type {
  OpencodeClient,
  Publisher,
  Sandbox,
  Widelog,
} from "../types/dependencies";
import type { PromptService } from "../types/prompt";
import type { RouteContext } from "../types/route";
import {
  type Auth,
  createWebSocketHandlers,
} from "../websocket/websocket-handler";

interface ApiServerConfig {
  proxyBaseUrl: string;
  opencodeUrl: string;
  github: {
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
  };
  frontendUrl?: string;
  auth: BetterAuthInstance;
}

interface ApiServerServices {
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
  private readonly router = new FileSystemRouter({
    dir: join(import.meta.dirname, "../routes"),
    style: "nextjs",
  });

  private readonly config: ApiServerConfig;
  private readonly services: ApiServerServices;

  constructor(config: ApiServerConfig, services: ApiServerServices) {
    this.config = config;
    this.services = services;
  }

  private getServer(): BunServer<unknown> {
    if (!this.server) {
      throw new ServiceUnavailableError(
        "Server not started",
        "SERVER_NOT_STARTED"
      );
    }
    return this.server;
  }

  start(port: string): Promise<Publisher> {
    const { proxyBaseUrl, opencodeUrl, github, frontendUrl, auth } =
      this.config;
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
      proxyBaseUrl,
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
      proxyBaseUrl,
      sessionStateStore,
    });

    const handleChannelRequest = createChannelRestHandler({
      browserService: browserService.service,
      opencode,
      logMonitor,
      proxyBaseUrl,
      sessionStateStore,
    });

    this.server = serve<WebSocketData<Auth>>({
      port,
      idleTimeout: SERVER.IDLE_TIMEOUT_SECONDS,
      websocket: websocketHandler,
      fetch: (request): Promise<Response | undefined> => {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/auth")) {
          const origin = request.headers.get("Origin");
          if (request.method === "OPTIONS") {
            return Promise.resolve(
              new Response(null, {
                status: 204,
                headers: {
                  "Access-Control-Allow-Origin": origin ?? "",
                  "Access-Control-Allow-Methods":
                    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type, Authorization",
                  "Access-Control-Allow-Credentials": "true",
                },
              })
            );
          }
          return auth.handler(request).then((response) => {
            if (origin) {
              response.headers.set("Access-Control-Allow-Origin", origin);
              response.headers.set("Access-Control-Allow-Credentials", "true");
            }
            return response;
          });
        }

        if (request.method === "OPTIONS") {
          const origin = request.headers.get("Origin") ?? undefined;
          return Promise.resolve(optionsResponse(origin));
        }

        if (url.pathname === "/ws") {
          return Promise.resolve(upgrade(request, this.getServer()));
        }

        if (url.pathname.startsWith("/opencode/")) {
          return this.handleRequestWithWideEvent(request, url, () => {
            this.services.widelog.set("route", "opencode_proxy");

            const labSessionId = request.headers.get("X-Lab-Session-Id");
            if (labSessionId) {
              this.services.widelog.set("session_id", labSessionId);
            }

            return handleOpenCodeProxy(request, url);
          });
        }

        const [, channel] = url.pathname.match(CHANNEL_SNAPSHOT_PATTERN) ?? [];
        if (channel) {
          return this.handleRequestWithWideEvent(request, url, async () => {
            this.services.widelog.set("route", "channel_snapshot");
            this.services.widelog.set("channel_id", channel);
            const origin = request.headers.get("Origin") ?? undefined;
            return withCors(
              await handleChannelRequest(channel, url.searchParams),
              origin
            );
          });
        }

        return this.handleRouteRequest(request, url, routeContext);
      },
    });

    reconcileNetworkConnections(sandbox).catch((error) => {
      const statusCode = error instanceof AppError ? error.statusCode : 500;

      widelog.context(() => {
        widelog.set("event_name", "api.server.network_reconciliation_failed");
        widelog.set("status_code", statusCode);
        widelog.set("port", port);
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        widelog.flush();
      });
    });

    return Promise.resolve(this.publisher);
  }

  private handleRouteRequest(
    request: Request,
    url: URL,
    routeContext: RouteContext
  ): Promise<Response> {
    return this.handleRequestWithWideEvent(request, url, async () => {
      const { widelog } = this.services;
      const { auth } = this.config;
      const origin = request.headers.get("Origin") ?? undefined;
      const match = this.router.match(request);

      if (!match) {
        widelog.set("route", "route_not_found");
        return withCors(notFoundResponse(), origin);
      }

      if (!match.name.startsWith("/internal/")) {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          widelog.set("auth", "unauthorized");
          const response = withCors(
            Response.json({ error: "Unauthorized" }, { status: 401 }),
            origin
          );
          response.headers.append(
            "Set-Cookie",
            "better-auth.session_token=; Path=/; Max-Age=0"
          );
          return response;
        }
        widelog.set("auth.user_id", session.user.id);
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
        return withCors(errorResponse(), origin);
      }

      if (!isHttpMethod(request.method)) {
        widelog.set("method_supported", false);
        return withCors(methodNotAllowedResponse(), origin);
      }

      const handler = module[request.method];
      if (!handler) {
        widelog.set("method_implemented", false);
        return withCors(methodNotAllowedResponse(), origin);
      }

      return withCors(
        await handler({ request, params: match.params, context: routeContext }),
        origin
      );
    });
  }

  private handleRequestWithWideEvent(
    request: Request,
    url: URL,
    handler: () => Promise<Response>
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
          error instanceof Error && status < 500
            ? error.message
            : "Internal server error";

        this.setStatusOutcome(status);
        widelog.errorFields(error);

        if (error instanceof AppError) {
          widelog.set("error.code", error.code);
        }

        const origin = request.headers.get("Origin") ?? undefined;
        const response = withCors(
          Response.json({ error: message, requestId }, { status }),
          origin
        );
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
