import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

const LAB_SESSION_HEADER = "x-lab-session-id";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const direct = headers[name];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  if (Array.isArray(direct) && typeof direct[0] === "string") {
    const first = direct[0].trim();
    return first.length > 0 ? first : null;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) {
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      const first = value[0].trim();
      return first.length > 0 ? first : null;
    }
  }

  return null;
}

export function resolveBoundLabSessionId(
  extra: ToolExtra,
  providedSessionId?: string
): { sessionId: string } | { error: string } {
  const headers = extra.requestInfo?.headers ?? {};
  const boundSessionId = readHeader(headers, LAB_SESSION_HEADER);

  if (!boundSessionId) {
    return {
      error:
        "Missing bound Lab session header. Reinitialize the ACP session so MCP requests include x-lab-session-id.",
    };
  }

  if (providedSessionId && providedSessionId !== boundSessionId) {
    return {
      error: `Session mismatch: provided "${providedSessionId}" but bound to "${boundSessionId}"`,
    };
  }

  return { sessionId: boundSessionId };
}
