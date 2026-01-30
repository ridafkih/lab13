import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DockerClient } from "@lab/sandbox-docker";
import { config } from "./config/environment";
import { makeRegisterTool } from "./tools/register";
import { listContainers } from "./tools/list-containers";
import { execContainer } from "./tools/exec-container";
import { getContainerLogs } from "./tools/get-container-logs";
import { inspectContainer } from "./tools/inspect-container";

const docker = new DockerClient();

const server = new McpServer({
  name: "lab-containers",
  version: "1.0.0",
});

const { registerTool } = makeRegisterTool(server, docker);

registerTool(listContainers);
registerTool(execContainer);
registerTool(getContainerLogs);
registerTool(inspectContainer);

const transport = new WebStandardStreamableHTTPServerTransport();

await server.connect(transport);

Bun.serve({
  port: config.port,
  fetch: (request) => transport.handleRequest(request),
});

console.log(`MCP server running on http://localhost:${config.port}`);
