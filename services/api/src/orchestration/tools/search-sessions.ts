import { tool } from "ai";
import { z } from "zod";
import { searchSessionsWithProject } from "../../repositories/session.repository";
import {
  fetchSessionMessages,
  type ReconstructedMessage,
} from "../acp-messages";

const inputSchema = z.object({
  query: z.string().describe("The search query to find relevant sessions"),
  limit: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of results to return"),
});

interface ScoredResult {
  relevantContent: string;
  score: number;
}

function scoreMessageContent(
  messages: ReconstructedMessage[],
  queryLower: string,
  queryLength: number
): ScoredResult | null {
  for (const message of messages) {
    const textLower = message.content.toLowerCase();
    if (textLower.includes(queryLower)) {
      const index = textLower.indexOf(queryLower);
      const start = Math.max(0, index - 50);
      const end = Math.min(message.content.length, index + queryLength + 50);
      return {
        relevantContent: `...${message.content.slice(start, end)}...`,
        score: 1.0,
      };
    }
  }
  return null;
}

function scoreRow(
  row: { title: string | null; projectName: string },
  messages: ReconstructedMessage[] | null,
  queryLower: string,
  queryLength: number
): ScoredResult {
  const titleMatches = row.title?.toLowerCase().includes(queryLower) ?? false;
  const projectMatches = row.projectName.toLowerCase().includes(queryLower);
  const messageResult = messages
    ? scoreMessageContent(messages, queryLower, queryLength)
    : null;

  const score = messageResult
    ? messageResult.score
    : Math.max(titleMatches ? 0.8 : 0, projectMatches ? 0.6 : 0);
  const relevantContent =
    messageResult?.relevantContent ?? (titleMatches ? (row.title ?? "") : "");

  return { relevantContent, score };
}

export function createSearchSessionsTool() {
  return tool({
    description:
      "Searches across session titles and conversation content to find relevant sessions. Returns matching sessions with relevant content snippets.",
    inputSchema,

    execute: async ({ query, limit }) => {
      const searchLimit = limit ?? 5;

      const rows = await searchSessionsWithProject({ query, limit });

      const messagePromises = rows.map((row) => {
        if (!row.sandboxSessionId) {
          return null;
        }
        return fetchSessionMessages(row.id).catch(() => null);
      });

      const allMessages = await Promise.all(messagePromises);
      const queryLower = query.toLowerCase();

      const results: Array<{
        sessionId: string;
        projectName: string;
        title: string | null;
        relevantContent: string;
        score: number;
      }> = [];

      for (const [rowIndex, row] of rows.entries()) {
        if (results.length >= searchLimit) {
          break;
        }

        const { relevantContent, score } = scoreRow(
          row,
          allMessages[rowIndex] ?? null,
          queryLower,
          query.length
        );

        if (score > 0) {
          results.push({
            sessionId: row.id,
            projectName: row.projectName,
            title: row.title,
            relevantContent,
            score,
          });
        }
      }

      results.sort(
        (leftResult, rightResult) => rightResult.score - leftResult.score
      );

      return { results: results.slice(0, searchLimit) };
    },
  });
}
