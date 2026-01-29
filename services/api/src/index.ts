import { join } from "node:path";
import { schema } from "@lab/multiplayer-channels";
import { type WebSocketData, createPublisher } from "@lab/multiplayer-server";
import { websocketHandler, upgrade, type Auth } from "./handlers/websocket";
import { isHttpMethod, isRouteModule } from "./utils/route-handler";

const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

const router = new Bun.FileSystemRouter({
  dir: join(import.meta.dirname, "routes"),
  style: "nextjs",
});

const port = process.env.API_PORT;

if (port === undefined) {
  throw Error("API_PORT must be defined");
}

const server = Bun.serve<WebSocketData<Auth>>({
  port,
  websocket: websocketHandler,
  async fetch(request): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/ws") {
      return upgrade(request, server);
    }

    const match = router.match(request);

    if (!match) {
      return withCors(new Response("Not found", { status: HTTP_NOT_FOUND }));
    }

    const module: unknown = await import(match.filePath);

    if (!isRouteModule(module)) {
      return withCors(
        new Response("Internal server error", { status: HTTP_INTERNAL_SERVER_ERROR }),
      );
    }

    if (!isHttpMethod(request.method)) {
      return withCors(new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED }));
    }

    const handler = module[request.method];

    if (!handler) {
      return withCors(new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED }));
    }

    const response = await handler(request, match.params);
    return withCors(response);
  },
});

export const publisher = createPublisher(schema, () => server);

console.log(`API server running on http://localhost:${server.port}`);
