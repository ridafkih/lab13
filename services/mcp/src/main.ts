import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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

    const { createServer } = extras;
    const transports = new Map<
      string,
      WebStandardStreamableHTTPServerTransport
    >();

    const jsonRpcError = (code: number, message: string, status: number) =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code, message },
          id: null,
        }),
        { status, headers: { "Content-Type": "application/json" } }
      );

    const handleInitialize = async (request: Request) => {
      const body = await request.json();
      const messages = Array.isArray(body) ? body : [body];
      const isInit = messages.some(isInitializeRequest);

      if (!isInit) {
        return jsonRpcError(
          -32_000,
          "Bad Request: Missing session ID for non-initialization request",
          400
        );
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });

      transport.onclose = () => {
        const sessionId = transport.sessionId;
        if (sessionId) {
          transports.delete(sessionId);
        }
      };

      const server = createServer();
      await server.connect(transport);

      return transport.handleRequest(request, { parsedBody: body });
    };

    const httpServer = serve({
      port: env.MCP_PORT,
      idleTimeout: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health") {
          return new Response("OK", { status: 200 });
        }

        const sessionId = request.headers.get("mcp-session-id");

        if (sessionId) {
          const transport = transports.get(sessionId);
          if (!transport) {
            return jsonRpcError(-32_001, "Session not found", 404);
          }
          return transport.handleRequest(request);
        }

        if (request.method === "POST") {
          return handleInitialize(request);
        }

        return jsonRpcError(-32_000, "Bad Request: Missing session ID", 400);
      },
    });

    widelog.flush();

    return () => {
      widelog.context(async () => {
        widelog.set("event_name", "mcp.shutdown");

        for (const [sessionId, transport] of transports) {
          try {
            await transport.close();
          } catch {
            // Ignore close errors during shutdown
          }
          transports.delete(sessionId);
        }

        httpServer.stop(true);
        widelog.flush();
      });
    };
  });
}) satisfies MainFunction;
