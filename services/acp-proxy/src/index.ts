import { serve } from "bun";
import { agentProcesses } from "./agent-process";
import { handleAcpDelete, handleAcpGet, handleAcpPost } from "./routes/acp";
import { handleGetAgent, handleListAgents } from "./routes/agents";
import { handleFsEntries, handleFsFile } from "./routes/fs";
import { handleHealth } from "./routes/health";

const ACP_PATTERN = /^\/v1\/acp\/([^/]+)$/;
const AGENT_ID_PATTERN = /^\/v1\/agents\/([^/]+)$/;

function route(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/health" && method === "GET") {
    return handleHealth();
  }

  if (path === "/v1/agents" && method === "GET") {
    return handleListAgents();
  }

  const agentMatch = path.match(AGENT_ID_PATTERN);
  if (agentMatch?.[1] && method === "GET") {
    return handleGetAgent(agentMatch[1], url);
  }

  const acpMatch = path.match(ACP_PATTERN);
  if (acpMatch?.[1]) {
    const serverId = acpMatch[1];

    if (method === "POST") {
      return handleAcpPost(request, serverId);
    }
    if (method === "GET") {
      return handleAcpGet(request, serverId);
    }
    if (method === "DELETE") {
      return handleAcpDelete(serverId);
    }
  }

  if (path === "/v1/fs/entries" && method === "GET") {
    return handleFsEntries(url);
  }

  if (path === "/v1/fs/file" && method === "GET") {
    return handleFsFile(url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

const PORT = Number(process.env.PORT ?? 3000);

const server = serve({
  port: PORT,
  fetch: route,
  idleTimeout: 255,
});

console.log(`acp-proxy listening on port ${server.port}`);

process.on("SIGTERM", async () => {
  const shutdowns = [...agentProcesses.values()].map((agent) =>
    agent.shutdown()
  );
  await Promise.allSettled(shutdowns);
  agentProcesses.clear();
  server.stop();
  process.exit(0);
});
