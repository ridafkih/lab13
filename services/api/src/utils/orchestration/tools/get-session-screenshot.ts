import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import type { BrowserService } from "../../browser/browser-service";

export interface GetSessionScreenshotToolContext {
  browserService: BrowserService;
}

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to get a screenshot from"),
});

export function createGetSessionScreenshotTool(context: GetSessionScreenshotToolContext) {
  return tool({
    description:
      "Gets a screenshot of the current browser state for a session. Use this when you want to show the user what the session looks like, such as after completing a task or when describing current progress. Returns the screenshot as a base64-encoded image.",
    inputSchema,
    execute: async ({ sessionId }) => {
      const session = await findSessionById(sessionId);

      if (!session) {
        return { error: "Session not found", hasScreenshot: false };
      }

      const frame = context.browserService.getCachedFrame(sessionId);

      if (!frame) {
        return { error: "No screenshot available for this session", hasScreenshot: false };
      }

      return {
        hasScreenshot: true,
        screenshot: {
          data: frame,
          encoding: "base64" as const,
          format: "png",
        },
      };
    },
  });
}
