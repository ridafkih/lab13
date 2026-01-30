import type { DaemonManager } from "../daemon-manager";

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface RouteContext {
  daemonManager: DaemonManager;
}

export type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  context: RouteContext,
) => Response | Promise<Response>;

export type RouteModule = Partial<Record<HttpMethod, RouteHandler>>;

const HTTP_METHODS: Set<string> = new Set(["GET", "POST", "DELETE"]);

export function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.has(method);
}

export function isRouteModule(module: unknown): module is RouteModule {
  if (typeof module !== "object" || module === null) return false;
  for (const key of Object.keys(module)) {
    if (HTTP_METHODS.has(key)) return true;
  }
  return false;
}
