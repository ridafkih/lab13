import { join } from "node:path";
import { createDaemonManager, type DaemonManager } from "./daemon-manager";
import { isHttpMethod, isRouteModule, type RouteContext } from "./utils/route-handler";

const API_PORT = parseInt(process.env.BROWSER_API_PORT ?? "80", 10);
const BASE_STREAM_PORT = parseInt(process.env.AGENT_BROWSER_STREAM_PORT ?? "9224", 10);
const PROFILE_DIR = process.env.AGENT_BROWSER_PROFILE_DIR;

const router = new Bun.FileSystemRouter({
  dir: join(import.meta.dirname, "routes"),
  style: "nextjs",
});

const daemonManager: DaemonManager = createDaemonManager({
  baseStreamPort: BASE_STREAM_PORT,
  profileDir: PROFILE_DIR,
});

// Start the default daemon
await daemonManager.start("default");

const context: RouteContext = { daemonManager };

Bun.serve({
  port: API_PORT,
  async fetch(request) {
    const match = router.match(request);

    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    const module: unknown = await import(match.filePath);

    if (!isRouteModule(module)) {
      return new Response("Internal Server Error", { status: 500 });
    }

    if (!isHttpMethod(request.method)) {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const handler = module[request.method];

    if (!handler) {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      return await handler(request, match.params, context);
    } catch (error) {
      console.error("[Server] Unhandled error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`[Server] Browser daemon listening on port ${API_PORT}`);

function gracefulShutdown() {
  console.log("[Server] Shutting down...");
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
