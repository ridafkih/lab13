import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import parse from "bash-parser";
import type { ToolContext } from "../types/tool";
import { config } from "../config/environment";

interface WorkspaceContainerResponse {
  dockerId: string;
  workdir: string;
}

async function getWorkspaceContainer(
  sessionId: string,
): Promise<WorkspaceContainerResponse | null> {
  const response = await fetch(
    `${config.apiBaseUrl}/internal/sessions/${sessionId}/workspace-container`,
  );
  if (!response.ok) return null;
  return response.json();
}

function getCommandName(node: object): string | null {
  if (!("type" in node) || !("name" in node)) return null;
  if (node.type !== "Command" && node.type !== "SimpleCommand") return null;
  if (typeof node.name !== "object" || node.name === null) return null;
  if (!("text" in node.name) || typeof node.name.text !== "string") return null;
  return node.name.text;
}

function findCommandNames(node: unknown): string[] {
  if (typeof node !== "object" || node === null) return [];

  const names: string[] = [];

  const commandName = getCommandName(node);
  if (commandName) {
    names.push(commandName);
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        names.push(...findCommandNames(item));
      }
    } else {
      names.push(...findCommandNames(value));
    }
  }

  return names;
}

function containsBlockedCommand(command: string, blocked: string[]): boolean {
  try {
    const ast = parse(command);
    const commandNames = findCommandNames(ast);
    return commandNames.some((name) => blocked.includes(name));
  } catch {
    return false;
  }
}

export function bash(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "bash",
    {
      description:
        "Execute a bash command in the session's workspace container. Use this tool to run shell commands, install packages, build projects, or interact with the filesystem. Note: For GitHub operations, use the github_* tools (e.g., github_create_pull_request).",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        command: z.string().describe("The bash command to execute"),
        workdir: z
          .string()
          .optional()
          .describe("Working directory for the command (defaults to workspace root)"),
        timeout: z.number().optional().describe("Timeout in milliseconds"),
      },
    },
    async (args) => {
      if (containsBlockedCommand(args.command, ["gh"])) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Direct use of the 'gh' CLI is not allowed. Use the GitHub tools instead:\n\n- github_create_pull_request: Create a PR\n- github_list_pull_requests: List PRs\n- github_get_pull_request_comments: Get PR reviews and comments\n- github_get_commit_status: Get CI/status checks\n- github_create_issue: Create an issue\n- github_get_repository: Get repo info`,
            },
          ],
        };
      }

      const workspace = await getWorkspaceContainer(args.sessionId);
      if (!workspace) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Could not find workspace container for session "${args.sessionId}". Make sure the session exists and has a workspace container.`,
            },
          ],
        };
      }

      const exists = await docker.containerExists(workspace.dockerId);
      if (!exists) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Workspace container "${workspace.dockerId}" not found or not running`,
            },
          ],
        };
      }

      const result = await docker.exec(workspace.dockerId, {
        command: ["sh", "-c", args.command],
        workdir: args.workdir || workspace.workdir,
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
