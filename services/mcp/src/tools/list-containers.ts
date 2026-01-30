import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types/tool";

export function listContainers(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "container_list",
    { description: "List all running Docker containers" },
    async () => {
      const containers = await docker.raw.listContainers({ all: false });

      const result = containers.map((container) => ({
        id: container.Id.slice(0, 12),
        names: container.Names,
        image: container.Image,
        state: container.State,
        status: container.Status,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
