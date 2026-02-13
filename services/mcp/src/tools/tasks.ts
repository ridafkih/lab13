import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const taskStatusSchema = z.enum(["pending", "in_progress", "completed"]);

const todoItemSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Stable task ID to preserve state across updates"),
  content: z.string().describe("Task text"),
  status: taskStatusSchema.describe("Current task status"),
  priority: z.number().optional().describe("Optional priority"),
});

export function tasks(server: McpServer, _: ToolContext) {
  server.registerTool(
    "TodoWrite",
    {
      description:
        "Write the full current task list. Always pass every active task, not just deltas.",
      inputSchema: {
        todos: z
          .array(todoItemSchema)
          .min(1)
          .describe("Complete ordered task list"),
      },
    },
    (args) => {
      return textResult(`Updated ${args.todos.length} task(s).`);
    }
  );

  server.registerTool(
    "TaskCreate",
    {
      description:
        "Create one task entry. Include id when available for stable tracking.",
      inputSchema: {
        id: z.string().optional().describe("Stable task ID"),
        content: z.string().describe("Task text"),
        status: taskStatusSchema.optional().describe("Defaults to pending"),
        priority: z.number().optional().describe("Optional priority"),
      },
    },
    (args) => {
      return textResult(`Created task: ${args.content}`);
    }
  );

  server.registerTool(
    "TaskUpdate",
    {
      description:
        "Update an existing task status/content. Provide content when changing wording.",
      inputSchema: {
        taskId: z.string().describe("ID of task to update"),
        content: z.string().optional().describe("Updated task text"),
        status: taskStatusSchema.describe("Updated task status"),
        priority: z.number().optional().describe("Updated priority"),
      },
    },
    (args) => {
      return textResult(
        `Updated task ${args.taskId} to ${args.status.replace("_", " ")}.`
      );
    }
  );
}
