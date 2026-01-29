import { join } from "node:path";
import { schema } from "@lab/multiplayer-channels";
import { type WebSocketData, createPublisher } from "@lab/multiplayer-server";
import { websocketHandler, upgrade, type Auth } from "./handlers/websocket";
import { isHttpMethod, isRouteModule } from "./utils/route-handler";

const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const router = new Bun.FileSystemRouter({
  dir: join(import.meta.dirname, "routes"),
  style: "nextjs",
});

const port = process.env.API_PORT ?? 3001;

const server = Bun.serve<WebSocketData<Auth>>({
  port,
  websocket: websocketHandler,
  async fetch(request): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return upgrade(request, server);
    }

    const match = router.match(request);

    if (!match) {
      return new Response("Not found", { status: HTTP_NOT_FOUND });
    }

    const module: unknown = await import(match.filePath);

    if (!isRouteModule(module)) {
      return new Response("Internal server error", { status: HTTP_INTERNAL_SERVER_ERROR });
    }

    if (!isHttpMethod(request.method)) {
      return new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED });
    }

    const handler = module[request.method];

    if (!handler) {
      return new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED });
    }

    return handler(request, match.params);
  },
});

export const publisher = createPublisher(schema, () => server);

console.log(`API server running on http://localhost:${server.port}`);
