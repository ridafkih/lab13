import { tool } from "ai";
import { z } from "zod";
import { findSessionById } from "../../repositories/session.repository";
import { fetchSessionMessages } from "../acp-messages";

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to get messages from"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of messages to return (most recent first)"),
});

export function createGetSessionMessagesTool() {
  return tool({
    description:
      "Gets conversation messages from a session. Returns messages in reverse chronological order (most recent first) with role and content.",
    inputSchema,
    execute: async ({ sessionId, limit }) => {
      const session = await findSessionById(sessionId);

      if (!session) {
        return { error: "Session not found", messages: [] };
      }

      if (!session.sandboxSessionId) {
        return {
          error: "Session has no conversation history yet",
          messages: [],
        };
      }

      try {
        const messages = await fetchSessionMessages(sessionId);

        return {
          messages: messages.slice(-(limit ?? 20)).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return { error: `Failed to fetch messages: ${message}`, messages: [] };
      }
    },
  });
}
