import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

const WHITESPACE_SPLIT_PATTERN = /\s+/;

interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;
  mimeType: "image/png";
}

type Content = TextContent | ImageContent;
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: Content[];
}

export interface CommandNode {
  description: string;
  children?: Record<string, CommandNode>;
  params?: z.ZodRawShape;
  handler?: (
    args: Record<string, unknown>,
    context: CommandContext
  ) => Promise<ToolResult>;
}

interface CommandContext {
  sessionId: string;
  generateCommandId: () => string;
  [key: string]: unknown;
}

interface HierarchicalToolConfig {
  name: string;
  description: string;
  sessionParam?: string;
  tree: Record<string, CommandNode>;
  contextFactory?: (sessionId: string) => CommandContext;
  resolveSessionId?: (
    args: Record<string, unknown>,
    extra: ToolExtra
  ) => { sessionId: string } | { error: string };
}

function parseCommandPath(input: string): string[] {
  return input.trim().split(WHITESPACE_SPLIT_PATTERN).filter(Boolean);
}

function isCommandNode(
  node: CommandNode | Record<string, CommandNode>
): node is CommandNode {
  return "description" in node;
}

function extractParamDescription(paramSchema: unknown): string {
  if (typeof paramSchema !== "object" || paramSchema === null) {
    return "";
  }
  const schema = Object.fromEntries(Object.entries(paramSchema));
  const zodDef =
    typeof schema._zod === "object" && schema._zod !== null
      ? Object.fromEntries(Object.entries(schema._zod))
      : undefined;
  const zodDefInner =
    zodDef && typeof zodDef.def === "object" && zodDef.def !== null
      ? Object.fromEntries(Object.entries(zodDef.def))
      : undefined;
  return (
    (typeof schema.description === "string" ? schema.description : "") ||
    (typeof zodDefInner?.description === "string"
      ? zodDefInner.description
      : "") ||
    ""
  );
}

function formatChildEntry(name: string, child: CommandNode): string[] {
  const hasChildren = child.children && Object.keys(child.children).length > 0;
  const hasHandler = Boolean(child.handler);

  if (hasChildren && !hasHandler) {
    return [`- \`${name}\`: ${child.description} (has subcommands)`];
  }

  if (hasHandler && child.params) {
    const lines = [
      `- \`${name}\`: ${child.description}`,
      "  Parameters (pass in subcommandArguments):",
    ];
    for (const [paramName, paramSchema] of Object.entries(child.params)) {
      lines.push(
        `    - \`${paramName}\`: ${extractParamDescription(paramSchema)}`
      );
    }
    return lines;
  }

  return [`- \`${name}\`: ${child.description}`];
}

function formatHelp(
  node: CommandNode | Record<string, CommandNode>,
  currentPath: string[]
): string {
  const children = "children" in node ? node.children : node;
  if (!children) {
    return "";
  }

  const pathStr = currentPath.length > 0 ? currentPath.join(" ") : "";
  const prefix = pathStr ? `${pathStr} ` : "";

  const lines: string[] = [];
  lines.push(
    currentPath.length > 0
      ? `**${pathStr}** commands:\n`
      : "**Available categories:**\n"
  );
  for (const [name, child] of Object.entries(children)) {
    lines.push(...formatChildEntry(name, child));
  }
  lines.push("", `Use: \`${prefix}<command>\` to see more or execute`);
  return lines.join("\n");
}

function getChildren(
  node: CommandNode | Record<string, CommandNode>
): Record<string, CommandNode> | undefined {
  return isCommandNode(node) ? node.children : node;
}

function navigateTree(
  tree: Record<string, CommandNode>,
  path: string[]
): {
  node: CommandNode | Record<string, CommandNode>;
  remainingPath: string[];
  traversedPath: string[];
} {
  let current: CommandNode | Record<string, CommandNode> = tree;
  const traversedPath: string[] = [];

  for (let segmentIndex = 0; segmentIndex < path.length; segmentIndex++) {
    const segment = path[segmentIndex];
    const children = getChildren(current);

    if (!(children && segment && segment in children)) {
      return {
        node: current,
        remainingPath: path.slice(segmentIndex),
        traversedPath,
      };
    }

    const next = children[segment];
    if (!next) {
      return {
        node: current,
        remainingPath: path.slice(segmentIndex),
        traversedPath,
      };
    }

    current = next;
    traversedPath.push(segment);
  }

  return { node: current, remainingPath: [], traversedPath };
}

function validateParams(
  params: Record<string, unknown>,
  schema: z.ZodRawShape
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string } {
  const result = z.object(schema).safeParse(params);
  if (result.success) {
    return {
      success: true,
      data: Object.fromEntries(Object.entries(result.data)),
    };
  }
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");
  return { success: false, error: `Invalid parameters: ${issues}` };
}

function generateCommandId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildUnknownCommandError(
  node: CommandNode | Record<string, CommandNode>,
  remainingPath: string[],
  traversedPath: string[]
): ToolResult {
  const available =
    "children" in node ? Object.keys(node.children || {}) : Object.keys(node);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Unknown command: '${remainingPath[0]}' at path '${traversedPath.join(" ")}'\nAvailable: ${available.join(", ")}`,
      },
    ],
  };
}

function executeHandlerNode(
  commandNode: CommandNode,
  subcommandArguments: Record<string, unknown> | undefined,
  context: CommandContext
): ToolResult | Promise<ToolResult> {
  const { handler } = commandNode;
  if (!handler) {
    return {
      isError: true,
      content: [{ type: "text", text: "Command has no handler" }],
    };
  }

  const params = subcommandArguments ?? {};
  if (commandNode.params) {
    const validation = validateParams(params, commandNode.params);
    if (!validation.success) {
      return {
        isError: true,
        content: [{ type: "text", text: validation.error }],
      };
    }
    return handler(validation.data, context);
  }

  return handler(params, context);
}

function resolveBoundSession(
  args: {
    sessionId?: string;
  },
  extra: unknown,
  resolveSessionId: HierarchicalToolConfig["resolveSessionId"] | undefined
): { sessionId: string } | { error: string } {
  if (resolveSessionId) {
    return resolveSessionId(args, extra);
  }

  if (typeof args.sessionId === "string" && args.sessionId.length > 0) {
    return { sessionId: args.sessionId };
  }

  return { error: "Missing sessionId" };
}

export function createHierarchicalTool(
  server: McpServer,
  config: HierarchicalToolConfig
): void {
  const { name, description, tree, contextFactory, resolveSessionId } = config;

  server.registerTool(
    name,
    {
      description: `${description}. Run with no command to see available categories.`,
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("Deprecated: inferred from bound session when available"),
        command: z
          .string()
          .optional()
          .describe("Command path, e.g., 'interact click' or 'nav goto'"),
        subcommandArguments: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Arguments for the subcommand as key-value pairs"),
      },
    },
    (args, extra) => {
      const sessionResult = resolveBoundSession(args, extra, resolveSessionId);

      if ("error" in sessionResult) {
        return {
          isError: true,
          content: [{ type: "text", text: sessionResult.error }],
        };
      }

      const command =
        typeof args.command === "string" ? args.command : undefined;
      const subcommandArguments =
        typeof args.subcommandArguments === "object" &&
        args.subcommandArguments !== null
          ? Object.fromEntries(Object.entries(args.subcommandArguments))
          : undefined;

      const context: CommandContext = contextFactory
        ? contextFactory(sessionResult.sessionId)
        : { sessionId: sessionResult.sessionId, generateCommandId };

      if (!command || command.trim() === "") {
        return { content: [{ type: "text", text: formatHelp(tree, []) }] };
      }

      const path = parseCommandPath(command);
      const { node, remainingPath, traversedPath } = navigateTree(tree, path);

      if (remainingPath.length > 0) {
        return buildUnknownCommandError(node, remainingPath, traversedPath);
      }

      if (isCommandNode(node) && node.handler) {
        return executeHandlerNode(node, subcommandArguments, context);
      }

      return {
        content: [{ type: "text", text: formatHelp(node, traversedPath) }],
      };
    }
  );
}
