import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";

export function execContainer(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "container_exec",
    {
      description: "Execute a shell command in a Docker container",
      inputSchema: {
        containerId: z.string().describe("The Docker container ID or name"),
        command: z.string().describe("The shell command to execute"),
        workdir: z.string().optional().describe("Working directory for the command"),
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

      const result = await docker.exec(args.containerId, {
        command: ["sh", "-c", args.command],
        workdir: args.workdir,
      });

      if (result.exitCode !== 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Exit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: result.stdout }],
      };
    },
  );
}
