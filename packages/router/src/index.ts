import { badRequestResponse } from "@lab/http-utilities";

export class RouteValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "RouteValidationError";
  }
}

/**
 * All valid HTTP methods.
 */
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Type guard to check if a string is a valid HTTP method.
 */
export function isHttpMethod(method: string): method is HttpMethod {
  const methods: readonly string[] = HTTP_METHODS;
  return methods.includes(method);
}

/**
 * Generic route handler function type.
 * Services should extend this with their own context type.
 */
export type RouteHandler<TContext = unknown> = (args: {
  request: Request;
  params: Record<string, string>;
  context: TContext;
}) => Response | Promise<Response>;

/**
 * A route module is a partial record of HTTP methods to handlers.
 */
export type RouteModule<TContext = unknown> = Partial<
  Record<HttpMethod, RouteHandler<TContext>>
>;

/**
 * Type guard to check if a module is a valid route module.
 */
export function isRouteModule<TContext>(
  module: unknown
): module is RouteModule<TContext> {
  if (typeof module !== "object" || module === null) {
    return false;
  }

  for (const [key, value] of Object.entries(module)) {
    if (!isHttpMethod(key)) {
      continue;
    }
    if (typeof value !== "function") {
      return false;
    }
  }

  return true;
}

/**
 * Gets the handler for a specific HTTP method from a route module.
 */
export function getHandler<TContext>(
  module: RouteModule<TContext>,
  method: string
): RouteHandler<TContext> | undefined {
  if (!isHttpMethod(method)) {
    return undefined;
  }
  return module[method];
}

/**
 * Extracts a route parameter from the params object.
 * Handles both string and string[] parameter types.
 */
export function extractRouteParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Requires a route parameter to be present.
 * Returns the value if present, or a 400 Bad Request Response if missing.
 */
export function requireRouteParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | Response {
  const value = extractRouteParam(params, key);
  if (!value) {
    return badRequestResponse(`Missing ${key}`);
  }
  return value;
}

/**
 * Type guard to check if a requireRouteParam result is a Response (error case).
 */
export function isErrorResponse(value: string | Response): value is Response {
  return value instanceof Response;
}

/**
 * Requires a route parameter to be present.
 * Throws RouteValidationError if missing.
 */
export function assertRouteParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string
): string {
  const value = params?.[key];
  const resolved = Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  if (!resolved) {
    throw new RouteValidationError(`Missing required parameter: ${key}`);
  }
  return resolved;
}
