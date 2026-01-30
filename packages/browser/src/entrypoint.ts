import { getSocketDir } from "agent-browser";
import {
  startSessionDaemon,
  stopSessionDaemon,
  getActiveSessions,
  isSessionActive,
  isSessionReady,
  getSessionPort,
  isDaemonRunning,
} from "./daemon-manager";

const API_PORT = parseInt(process.env.BROWSER_API_PORT ?? "80", 10);
const DEFAULT_STREAM_PORT = parseInt(process.env.AGENT_BROWSER_STREAM_PORT ?? "9224", 10);
const SOCKET_DIR = getSocketDir();

console.log(`Socket directory: ${SOCKET_DIR}`);

await startSessionDaemon("default", { streamPort: DEFAULT_STREAM_PORT });

async function runAgentBrowser(sessionId: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["bunx", "agent-browser", ...args], {
    env: {
      ...process.env,
      AGENT_BROWSER_SESSION: sessionId,
      AGENT_BROWSER_SOCKET_DIR: SOCKET_DIR,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr || `agent-browser exited with code ${exitCode}`);
  }

  return output.trim();
}

Bun.serve({
  port: API_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "POST" && path.match(/^\/daemons\/[^/]+\/launch$/)) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }

      if (!isSessionActive(sessionId)) {
        return Response.json({ error: "Session not active" }, { status: 404 });
      }

      try {
        const currentUrl = await runAgentBrowser(sessionId, ["get", "url"]);
        return Response.json({ sessionId, launched: true, url: currentUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    if (req.method === "GET" && path.match(/^\/daemons\/[^/]+\/url$/)) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }

      if (!isSessionActive(sessionId)) {
        return Response.json({ error: "Session not active" }, { status: 404 });
      }

      try {
        const output = await runAgentBrowser(sessionId, ["get", "url"]);
        return Response.json({ sessionId, url: output || null });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    if (req.method === "POST" && path.match(/^\/daemons\/[^/]+\/navigate$/)) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }

      if (!isSessionActive(sessionId)) {
        console.log(`[Navigate] Session ${sessionId} not active`);
        return Response.json({ error: "Session not active" }, { status: 404 });
      }

      if (!isSessionReady(sessionId)) {
        console.log(`[Navigate] Session ${sessionId} not ready`);
        return Response.json({ error: "Session not ready" }, { status: 503 });
      }

      let targetUrl: string;
      try {
        const body = await req.json();
        targetUrl = body.url;
      } catch {
        return Response.json({ error: "URL required" }, { status: 400 });
      }

      if (!targetUrl) {
        return Response.json({ error: "URL required" }, { status: 400 });
      }

      console.log(`[Navigate] Session ${sessionId} navigating to ${targetUrl}`);
      try {
        await runAgentBrowser(sessionId, ["open", targetUrl]);
        console.log(`[Navigate] Session ${sessionId} navigation complete`);
        return Response.json({ sessionId, navigated: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Navigate] Session ${sessionId} navigation failed: ${message}`);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    if (req.method === "POST" && path.startsWith("/daemons/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }

      let streamPort: number | undefined;
      try {
        const body = await req.json();
        streamPort = body.streamPort;
      } catch {
        // No body or invalid JSON is fine
      }

      const result = await startSessionDaemon(sessionId, { streamPort });
      return Response.json({ sessionId, ...result });
    }

    if (req.method === "DELETE" && path.startsWith("/daemons/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }
      const result = stopSessionDaemon(sessionId);
      return Response.json({ sessionId, ...result });
    }

    if (req.method === "GET" && path === "/daemons") {
      return Response.json({ daemons: getActiveSessions() });
    }

    if (req.method === "GET" && path.startsWith("/daemons/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }
      return Response.json({
        sessionId,
        running: isSessionActive(sessionId) && isDaemonRunning(sessionId),
        ready: isSessionReady(sessionId),
        port: getSessionPort(sessionId) ?? null,
      });
    }

    if (req.method === "GET" && path === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Browser API listening on port ${API_PORT}`);

function gracefulShutdown() {
  console.log("Shutting down...");
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
