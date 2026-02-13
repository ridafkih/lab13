import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parse } from "shell-quote";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { resolveBoundLabSessionId } from "../utils/session-binding";

interface WorkspaceContainerResponse {
  runtimeId: string;
  workdir: string;
}

async function getWorkspaceContainer(
  apiBaseUrl: string,
  sessionId: string
): Promise<WorkspaceContainerResponse | null> {
  const response = await fetch(
    `${apiBaseUrl}/internal/sessions/${sessionId}/workspace-container`
  );
  if (!response.ok) {
    return null;
  }
  return response.json();
}

const BLOCKED_COMMANDS = [
  {
    name: "gh",
    subcommand: undefined,
    message: `Error: Direct use of the 'gh' CLI is not allowed. Use the GitHub tools instead:\n\n- github_create_pull_request: Create a PR\n- github_list_pull_requests: List PRs\n- github_get_pull_request_comments: Get PR reviews and comments\n- github_get_commit_status: Get CI/status checks\n- github_create_issue: Create an issue\n- github_get_repository: Get repo info`,
  },
] as const;

type BlockedCommand = (typeof BLOCKED_COMMANDS)[number];

function isOperator(token: unknown): boolean {
  return typeof token === "object" && token !== null && "op" in token;
}

function getCommandSegments(command: string): string[][] {
  const segments: string[][] = [[]];

  for (const token of parse(command)) {
    if (isOperator(token)) {
      segments.push([]);
    } else if (typeof token === "string") {
      const current = segments.at(-1);
      if (current) {
        current.push(token);
      }
    }
  }

  return segments.filter((segment) => segment.length > 0);
}

function matchesBlocked(
  [name, subcommand]: string[],
  blocked: BlockedCommand
): boolean {
  if (name !== blocked.name) {
    return false;
  }
  return blocked.subcommand === undefined || subcommand === blocked.subcommand;
}

function findBlockedCommand(command: string): BlockedCommand | null {
  for (const segment of getCommandSegments(command)) {
    const match = BLOCKED_COMMANDS.find((blocked) =>
      matchesBlocked(segment, blocked)
    );
    if (match) {
      return match;
    }
  }
  return null;
}

export function bash(server: McpServer, { docker, config }: ToolContext) {
  server.registerTool(
    "Bash",
    {
      description:
        "Execute a bash command in the session's workspace container. Use this tool to run shell commands, install packages, build projects, or interact with the filesystem. Note: For GitHub operations, use the github_* tools (e.g., github_create_pull_request).",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
        command: z.string().describe("The bash command to execute"),
        workdir: z
          .string()
          .optional()
          .describe(
            "Working directory for the command (defaults to workspace root)"
          ),
        timeout: z.number().optional().describe("Timeout in milliseconds"),
      },
    },
    async (args, extra) => {
      const blocked = findBlockedCommand(args.command);
      if (blocked) {
        return {
          isError: true,
          content: [{ type: "text", text: blocked.message }],
        };
      }

      const resolvedSession = resolveBoundLabSessionId(extra, args.sessionId);
      if ("error" in resolvedSession) {
        return {
          isError: true,
          content: [{ type: "text", text: resolvedSession.error }],
        };
      }

      const workspace = await getWorkspaceContainer(
        config.API_BASE_URL,
        resolvedSession.sessionId
      );
      if (!workspace) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Could not find workspace container for session "${resolvedSession.sessionId}". Make sure the session exists and has a workspace container.`,
            },
          ],
        };
      }

      const exists = await docker.containerExists(workspace.runtimeId);
      if (!exists) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Workspace container "${workspace.runtimeId}" not found or not running`,
            },
          ],
        };
      }

      const result = await docker.exec(workspace.runtimeId, {
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
    }
  );
}
