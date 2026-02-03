import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DockerClient } from "@lab/sandbox-docker";
import { config } from "./config/environment";
import { makeRegisterTool } from "./tools/register";
import { bash } from "./tools/bash";
import { github } from "./tools/github";
import { listProcesses } from "./tools/list-processes";
import { getContainerLogs } from "./tools/get-container-logs";
import { getInternalUrl } from "./tools/get-internal-url";
import { getExternalUrl } from "./tools/get-external-url";

const docker = new DockerClient();

const server = new McpServer({
  name: "lab-containers",
  version: "1.0.0",
});

const { registerTool } = makeRegisterTool(server, docker);

registerTool(bash);
registerTool(github);
registerTool(listProcesses);
registerTool(getContainerLogs);
registerTool(getInternalUrl);
registerTool(getExternalUrl);

const transport = new WebStandardStreamableHTTPServerTransport();

await server.connect(transport);

Bun.serve({
  port: config.port,
  fetch: (request) => transport.handleRequest(request),
});

console.log(`MCP server running on http://localhost:${config.port}`);
