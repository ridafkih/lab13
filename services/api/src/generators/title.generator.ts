import { streamText } from "ai";
import { readModelConfig, createLanguageModel } from "../shared/llm-factory";
import { updateSessionTitle } from "../repositories/session.repository";
import type { Publisher } from "../types/dependencies";
import { widelog } from "../logging";

function buildPrompt(userMessage: string): string {
  return `Generate a brief, descriptive title (3-6 words) for a chat session based on the user's initial message. The title should capture the main intent or topic. Do not include quotes or punctuation at the end. Only output the title, nothing else.

User's message: ${userMessage}`;
}

interface GenerateTitleOptions {
  sessionId: string;
  userMessage: string;
  fallbackTitle?: string;
  publisher: Publisher;
}

export async function generateSessionTitle(options: GenerateTitleOptions): Promise<string> {
  const { sessionId, userMessage, fallbackTitle, publisher } = options;

  return widelog.context(async () => {
    widelog.set("event_name", "title_generator.completed");
    widelog.set("session_id", sessionId);
    widelog.time.start("duration_ms");

    try {
      const config = readModelConfig("orchestrator");
      const model = createLanguageModel(config);
      const prompt = buildPrompt(userMessage);

      const result = streamText({
        model,
        prompt,
      });

      let accumulatedTitle = "";

      for await (const textPart of result.textStream) {
        accumulatedTitle += textPart;

        publisher.publishDelta(
          "sessionMetadata",
          { uuid: sessionId },
          { title: accumulatedTitle.trim() },
        );
      }

      const finalTitle = accumulatedTitle.trim() || fallbackTitle || "New Session";

      const updatedSession = await updateSessionTitle(sessionId, finalTitle);

      if (updatedSession) {
        publisher.publishDelta("sessions", {
          type: "update",
          session: {
            id: updatedSession.id,
            projectId: updatedSession.projectId,
            title: updatedSession.title,
          },
        });
      }

      widelog.set("outcome", "success");
      widelog.set("title_length", finalTitle.length);
      return finalTitle;
    } catch (error) {
      widelog.set("outcome", "error");
      widelog.errorFields(error);

      const fallback = fallbackTitle || userMessage.slice(0, 50).trim() || "New Session";
      const updatedSession = await updateSessionTitle(sessionId, fallback);

      if (updatedSession) {
        publisher.publishDelta("sessions", {
          type: "update",
          session: {
            id: updatedSession.id,
            projectId: updatedSession.projectId,
            title: updatedSession.title,
          },
        });
      }

      widelog.set("used_fallback", true);
      return fallback;
    } finally {
      widelog.time.stop("duration_ms");
      widelog.flush();
    }
  });
}
