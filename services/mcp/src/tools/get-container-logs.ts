import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";

export function getContainerLogs(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "container_logs",
    {
      description: "View recent logs from a Docker container",
      inputSchema: {
        containerId: z.string().describe("The Docker container ID or name"),
        tail: z.number().optional().describe("Number of lines to retrieve (default: 100)"),
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

      const lines = args.tail ?? 100;
      const logs: string[] = [];
      for await (const chunk of docker.streamLogs(args.containerId, { tail: lines })) {
        const text = new TextDecoder().decode(chunk.data);
        logs.push(`[${chunk.stream}] ${text}`);
      }

      return {
        content: [{ type: "text", text: logs.join("") || "(no logs)" }],
      };
    },
  );
}
