import { serve } from "bun";
import type { env } from "./env";
import { widelog } from "./logging";
import type { setup } from "./setup";

interface MainOptions {
  env: (typeof env)["inferOut"];
  extras: Awaited<ReturnType<typeof setup>>;
}

type MainFunction = (options: MainOptions) => unknown;

export const main = (({ env, extras }) => {
  return widelog.context(() => {
    widelog.set("event_name", "mcp.startup");
    widelog.set("port", env.MCP_PORT);

    const { server, transport } = extras;

    server.connect(transport);

    const httpServer = serve({
      port: env.MCP_PORT,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health") {
          return new Response("OK", { status: 200 });
        }
        return transport.handleRequest(request);
      },
    });

    widelog.flush();

    return () => {
      widelog.context(() => {
        widelog.set("event_name", "mcp.shutdown");
        httpServer.stop(true);
        widelog.flush();
      });
    };
  });
}) satisfies MainFunction;
