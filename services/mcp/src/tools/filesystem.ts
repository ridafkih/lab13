import { posix as pathPosix } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { resolveBoundLabSessionId } from "../utils/session-binding";
import {
  consumeRecentFileRead,
  markFileRead,
} from "../utils/session-file-read-state";

interface WorkspaceContainerResponse {
  runtimeId: string;
  workdir: string;
}

interface WorkspaceExecutionContext {
  runtimeId: string;
  workspaceRoot: string;
}

interface ReplacePatchInput {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const OUTPUT_LINE_LIMIT = 2000;
const READ_BYTE_LIMIT = 1_000_000;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function trimOutput(output: string, lineLimit = OUTPUT_LINE_LIMIT): string {
  const lines = output.split("\n");
  if (lines.length <= lineLimit) {
    return output;
  }
  const visible = lines.slice(0, lineLimit).join("\n");
  return `${visible}\n... [truncated ${lines.length - lineLimit} lines]`;
}

function extractFilePath(
  args: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const candidate = getString(args[key]);
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string
): string {
  const normalizedRoot = pathPosix.resolve(workspaceRoot);
  const candidate = requestedPath.startsWith("/")
    ? pathPosix.resolve(requestedPath)
    : pathPosix.resolve(normalizedRoot, requestedPath);

  if (
    !(
      candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}/`)
    )
  ) {
    throw new Error("Path must remain inside the workspace root");
  }

  return candidate;
}

function normalizeRelativePath(
  workspaceRoot: string,
  absolutePath: string
): string {
  const relative = pathPosix.relative(workspaceRoot, absolutePath);
  return relative.length > 0 ? relative : ".";
}

function resolveSessionId(
  extra: ToolExtra,
  providedSessionId: string | undefined
): { sessionId: string } | { error: ReturnType<typeof errorResult> } {
  const resolvedSession = resolveBoundLabSessionId(extra, providedSessionId);
  if ("error" in resolvedSession) {
    return { error: errorResult(resolvedSession.error) };
  }
  return { sessionId: resolvedSession.sessionId };
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

async function createWorkspaceExecutionContext(
  sessionId: string,
  context: ToolContext
): Promise<WorkspaceExecutionContext> {
  const workspace = await getWorkspaceContainer(
    context.config.API_BASE_URL,
    sessionId
  );

  if (!workspace) {
    throw new Error(
      `Could not find workspace container for session "${sessionId}"`
    );
  }

  const exists = await context.docker.containerExists(workspace.runtimeId);
  if (!exists) {
    throw new Error(
      `Workspace container "${workspace.runtimeId}" is not running`
    );
  }

  return {
    runtimeId: workspace.runtimeId,
    workspaceRoot: workspace.workdir,
  };
}

async function readFileContent(
  executionContext: WorkspaceExecutionContext,
  context: ToolContext,
  absolutePath: string
): Promise<string> {
  const result = await context.docker.exec(executionContext.runtimeId, {
    command: ["cat", absolutePath],
    workdir: executionContext.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to read file: ${absolutePath}`);
  }

  if (result.stdout.length > READ_BYTE_LIMIT) {
    return `${result.stdout.slice(0, READ_BYTE_LIMIT)}\n... [truncated file output]`;
  }

  return result.stdout;
}

async function writeFileContent(
  executionContext: WorkspaceExecutionContext,
  context: ToolContext,
  absolutePath: string,
  content: string
): Promise<void> {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const script =
    'set -e; mkdir -p "$(dirname "$1")"; printf "%s" "$2" | base64 -d > "$1"';

  const result = await context.docker.exec(executionContext.runtimeId, {
    command: ["sh", "-lc", script, "sh", absolutePath, encoded],
    workdir: executionContext.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to write file: ${absolutePath}`);
  }
}

async function applyUnifiedPatch(
  executionContext: WorkspaceExecutionContext,
  context: ToolContext,
  patch: string
): Promise<string> {
  const patchBase64 = Buffer.from(patch, "utf8").toString("base64");
  const script = `
set -e
PATCH_FILE="$(mktemp)"
cleanup() { rm -f "$PATCH_FILE"; }
trap cleanup EXIT
printf "%s" "$1" | base64 -d > "$PATCH_FILE"
if command -v git >/dev/null 2>&1; then
  if git apply --recount --whitespace=nowarn "$PATCH_FILE"; then
    echo "Patch applied with git apply"
    exit 0
  fi
fi
if command -v patch >/dev/null 2>&1; then
  patch -p0 < "$PATCH_FILE"
  echo "Patch applied with patch -p0"
  exit 0
fi
echo "No patch tool available (git apply or patch required)" >&2
exit 1
`;

  const result = await context.docker.exec(executionContext.runtimeId, {
    command: ["sh", "-lc", script, "sh", patchBase64],
    workdir: executionContext.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Failed to apply patch");
  }

  return result.stdout.trim() || "Patch applied";
}

function applyReplacePatch(
  fileContent: string,
  input: ReplacePatchInput
): { updatedContent: string; replacements: number } {
  if (input.oldString.length === 0) {
    throw new Error("oldString cannot be empty");
  }

  if (input.replaceAll) {
    const segments = fileContent.split(input.oldString);
    const replacementCount = segments.length - 1;
    if (replacementCount === 0) {
      throw new Error("No matches found for oldString");
    }
    return {
      updatedContent: segments.join(input.newString),
      replacements: replacementCount,
    };
  }

  const index = fileContent.indexOf(input.oldString);
  if (index === -1) {
    throw new Error("No match found for oldString");
  }

  return {
    updatedContent:
      fileContent.slice(0, index) +
      input.newString +
      fileContent.slice(index + input.oldString.length),
    replacements: 1,
  };
}

async function runGrep(
  executionContext: WorkspaceExecutionContext,
  context: ToolContext,
  options: {
    pattern: string;
    path: string;
    glob: string | null;
    ignoreCase: boolean;
  }
): Promise<string> {
  const script = `
set -e
TARGET_PATH="$1"
PATTERN="$2"
GLOB_PATTERN="$3"
IGNORE_CASE="$4"
if command -v rg >/dev/null 2>&1; then
  CMD="rg --line-number --no-heading --color never"
  if [ "$IGNORE_CASE" = "1" ]; then
    CMD="$CMD -i"
  fi
  if [ -n "$GLOB_PATTERN" ]; then
    CMD="$CMD -g \\"$GLOB_PATTERN\\""
  fi
  set +e
  eval "$CMD -- \\"$PATTERN\\" \\"$TARGET_PATH\\""
  EXIT_CODE=$?
  set -e
  if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 1 ]; then
    exit 0
  fi
  exit $EXIT_CODE
fi
if [ -n "$GLOB_PATTERN" ]; then
  find "$TARGET_PATH" -type f -name "$GLOB_PATTERN" -print0 | xargs -0 grep -nH -- "$PATTERN" || true
else
  grep -R -n -H -- "$PATTERN" "$TARGET_PATH" || true
fi
`;

  const result = await context.docker.exec(executionContext.runtimeId, {
    command: [
      "sh",
      "-lc",
      script,
      "sh",
      options.path,
      options.pattern,
      options.glob ?? "",
      options.ignoreCase ? "1" : "0",
    ],
    workdir: executionContext.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "grep command failed");
  }

  return trimOutput(result.stdout);
}

async function runGlob(
  executionContext: WorkspaceExecutionContext,
  context: ToolContext,
  options: {
    pattern: string;
    path: string;
  }
): Promise<string> {
  const script = `
set -e
TARGET_PATH="$1"
PATTERN="$2"
if command -v rg >/dev/null 2>&1; then
  rg --files "$TARGET_PATH" -g "$PATTERN" || true
  exit 0
fi
find "$TARGET_PATH" -type f -name "$PATTERN" || true
`;

  const result = await context.docker.exec(executionContext.runtimeId, {
    command: ["sh", "-lc", script, "sh", options.path, options.pattern],
    workdir: executionContext.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "glob command failed");
  }

  const absoluteLines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const relativeLines = absoluteLines.map((line) =>
    line.startsWith(executionContext.workspaceRoot)
      ? normalizeRelativePath(executionContext.workspaceRoot, line)
      : line
  );
  return trimOutput(relativeLines.join("\n"));
}

function registerReadTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "Read",
    {
      description:
        "Read a text file from the session workspace. Supports optional line offset and limit.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session"),
        filePath: z.string().optional().describe("Path to file"),
        file_path: z.string().optional().describe("Path to file"),
        offset: z.number().int().min(0).optional().describe("Line offset"),
        limit: z.number().int().min(1).optional().describe("Line count limit"),
      },
    },
    async (args, extra) => {
      try {
        const resolved = resolveSessionId(
          extra,
          getString(args.sessionId) ?? undefined
        );
        if ("error" in resolved) {
          return resolved.error;
        }

        const filePath = extractFilePath(args, ["filePath", "file_path"]);
        if (!filePath) {
          return errorResult("Missing filePath");
        }

        const executionContext = await createWorkspaceExecutionContext(
          resolved.sessionId,
          context
        );
        const absolutePath = resolveWorkspacePath(
          executionContext.workspaceRoot,
          filePath
        );
        const content = await readFileContent(
          executionContext,
          context,
          absolutePath
        );
        markFileRead(resolved.sessionId, absolutePath);
        const offset = getNumber(args.offset) ?? 0;
        const limit = getNumber(args.limit);
        if (offset > 0 || limit !== null) {
          const lines = content.split("\n");
          const start = Math.max(0, offset);
          const end =
            limit !== null ? start + Math.max(1, limit) : lines.length;
          return textResult(lines.slice(start, end).join("\n"));
        }
        return textResult(content);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Read failed"
        );
      }
    }
  );
}

function registerWriteTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "Write",
    {
      description:
        "Write full file contents in the workspace. Creates parent directories as needed.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session"),
        filePath: z.string().optional().describe("Path to file"),
        file_path: z.string().optional().describe("Path to file"),
        content: z.string().describe("Full file content to write"),
      },
    },
    async (args, extra) => {
      try {
        const resolved = resolveSessionId(
          extra,
          getString(args.sessionId) ?? undefined
        );
        if ("error" in resolved) {
          return resolved.error;
        }

        const filePath = extractFilePath(args, ["filePath", "file_path"]);
        if (!filePath) {
          return errorResult("Missing filePath");
        }
        const contentValue = getString(args.content);
        if (contentValue === null) {
          return errorResult("Missing content");
        }

        const executionContext = await createWorkspaceExecutionContext(
          resolved.sessionId,
          context
        );
        const absolutePath = resolveWorkspacePath(
          executionContext.workspaceRoot,
          filePath
        );
        await writeFileContent(
          executionContext,
          context,
          absolutePath,
          contentValue
        );
        return textResult(
          `Wrote ${normalizeRelativePath(executionContext.workspaceRoot, absolutePath)}`
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Write failed"
        );
      }
    }
  );
}

function registerPatchTool(
  server: McpServer,
  context: ToolContext,
  toolName: "Patch" | "Edit"
): void {
  server.registerTool(
    toolName,
    {
      description:
        toolName === "Patch"
          ? "Apply a unified patch or perform targeted string replacement in a workspace file."
          : "Edit a workspace file by replacing oldString with newString (single or all matches).",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session"),
        patch: z.string().optional().describe("Unified diff patch content"),
        filePath: z.string().optional().describe("Path to file"),
        file_path: z.string().optional().describe("Path to file"),
        oldString: z.string().optional().describe("String to replace"),
        old_string: z.string().optional().describe("String to replace"),
        newString: z.string().optional().describe("Replacement string"),
        new_string: z.string().optional().describe("Replacement string"),
        replaceAll: z.boolean().optional().describe("Replace all matches"),
        replace_all: z.boolean().optional().describe("Replace all matches"),
      },
    },
    async (args, extra) => {
      try {
        const resolved = resolveSessionId(
          extra,
          getString(args.sessionId) ?? undefined
        );
        if ("error" in resolved) {
          return resolved.error;
        }
        const executionContext = await createWorkspaceExecutionContext(
          resolved.sessionId,
          context
        );

        const unifiedPatch = getString(args.patch);
        if (unifiedPatch?.trim()) {
          const message = await applyUnifiedPatch(
            executionContext,
            context,
            unifiedPatch
          );
          return textResult(message);
        }

        const filePath = extractFilePath(args, ["filePath", "file_path"]);
        const oldString =
          getString(args.oldString) ?? getString(args.old_string);
        const newString =
          getString(args.newString) ?? getString(args.new_string);
        const replaceAll = getBoolean(args.replaceAll ?? args.replace_all);

        if (!(filePath && oldString !== null && newString !== null)) {
          return errorResult(
            "Provide either patch, or filePath + oldString + newString"
          );
        }

        const absolutePath = resolveWorkspacePath(
          executionContext.workspaceRoot,
          filePath
        );
        if (
          toolName === "Edit" &&
          !consumeRecentFileRead(resolved.sessionId, absolutePath)
        ) {
          return errorResult(
            `Must read file before editing. Run Read on "${normalizeRelativePath(executionContext.workspaceRoot, absolutePath)}" first.`
          );
        }
        const content = await readFileContent(
          executionContext,
          context,
          absolutePath
        );
        const replacement = applyReplacePatch(content, {
          oldString,
          newString,
          replaceAll,
        });
        await writeFileContent(
          executionContext,
          context,
          absolutePath,
          replacement.updatedContent
        );
        return textResult(
          `Applied ${replacement.replacements} replacement(s) to ${normalizeRelativePath(executionContext.workspaceRoot, absolutePath)}`
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Patch failed"
        );
      }
    }
  );
}

function registerGrepTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "Grep",
    {
      description:
        "Search files in workspace by regex/text pattern. Uses ripgrep when available.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session"),
        pattern: z.string().describe("Search pattern"),
        path: z.string().optional().describe("Search directory path"),
        glob: z.string().optional().describe("Optional file glob filter"),
        ignoreCase: z.boolean().optional().describe("Case-insensitive search"),
      },
    },
    async (args, extra) => {
      try {
        const resolved = resolveSessionId(
          extra,
          getString(args.sessionId) ?? undefined
        );
        if ("error" in resolved) {
          return resolved.error;
        }

        const pattern = getString(args.pattern);
        if (!pattern) {
          return errorResult("Missing pattern");
        }

        const executionContext = await createWorkspaceExecutionContext(
          resolved.sessionId,
          context
        );
        const searchPath = resolveWorkspacePath(
          executionContext.workspaceRoot,
          getString(args.path) ?? "."
        );
        const output = await runGrep(executionContext, context, {
          pattern,
          path: searchPath,
          glob: getString(args.glob),
          ignoreCase: getBoolean(args.ignoreCase),
        });
        return textResult(output);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Grep failed"
        );
      }
    }
  );
}

function registerGlobTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "Glob",
    {
      description:
        "List files in workspace matching a glob pattern. Uses ripgrep when available.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session"),
        pattern: z.string().describe("Glob pattern (e.g., **/*.ts)"),
        path: z.string().optional().describe("Base directory path"),
      },
    },
    async (args, extra) => {
      try {
        const resolved = resolveSessionId(
          extra,
          getString(args.sessionId) ?? undefined
        );
        if ("error" in resolved) {
          return resolved.error;
        }

        const pattern = getString(args.pattern);
        if (!pattern) {
          return errorResult("Missing pattern");
        }

        const executionContext = await createWorkspaceExecutionContext(
          resolved.sessionId,
          context
        );
        const basePath = resolveWorkspacePath(
          executionContext.workspaceRoot,
          getString(args.path) ?? "."
        );
        const output = await runGlob(executionContext, context, {
          pattern,
          path: basePath,
        });
        return textResult(output);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Glob failed"
        );
      }
    }
  );
}

export function filesystem(server: McpServer, context: ToolContext): void {
  registerReadTool(server, context);
  registerWriteTool(server, context);
  registerPatchTool(server, context, "Patch");
  registerPatchTool(server, context, "Edit");
  registerGrepTool(server, context);
  registerGlobTool(server, context);
}
