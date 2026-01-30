import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";

export function inspectContainer(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "container_inspect",
    {
      description: "Get detailed information about a Docker container",
      inputSchema: {
        containerId: z.string().describe("The Docker container ID or name"),
      },
    },
    async (args) => {
      const exists = await docker.containerExists(args.containerId);
      if (!exists) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: Container "${args.containerId}" not found` }],
        };
      }

      const info = await docker.inspectContainer(args.containerId);

      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      };
    },
  );
}
