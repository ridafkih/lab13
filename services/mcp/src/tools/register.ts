import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DockerClient } from "@lab/sandbox-docker";
import type { ToolContext } from "../types/tool";

export function makeRegisterTool(server: McpServer, docker: DockerClient) {
  const context: ToolContext = { docker };

  return {
    registerTool(registrar: (server: McpServer, context: ToolContext) => void) {
      registrar(server, context);
    },
  };
}
