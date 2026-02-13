import { LIMITS } from "../config/constants";
import { widelog } from "../logging";
import {
  fetchSessionMessages,
  type ReconstructedMessage,
} from "../orchestration/acp-messages";
import { complete } from "../orchestration/llm";
import { findSessionById } from "../repositories/session.repository";
import { MESSAGE_ROLE } from "../types/message";

interface TaskSummary {
  success: boolean;
  outcome: string;
  summary: string;
}

interface GenerateSummaryOptions {
  sessionId: string;
  originalTask: string;
  platformOrigin?: string;
}

function trimForMessage(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

function buildFallbackSummary(
  originalTask: string,
  messages: ReconstructedMessage[]
): TaskSummary {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === MESSAGE_ROLE.ASSISTANT);

  if (lastAssistantMessage?.content) {
    return {
      success: true,
      outcome: "Session completed",
      summary: trimForMessage(
        lastAssistantMessage.content,
        LIMITS.SUMMARY_FALLBACK_LENGTH
      ),
    };
  }

  return {
    success: true,
    outcome: "Session completed",
    summary: trimForMessage(
      `Session completed for task: ${originalTask}. I couldn't extract a detailed transcript, but the session reached completion.`,
      LIMITS.SUMMARY_FALLBACK_LENGTH
    ),
  };
}

function formatConversationForLLM(messages: ReconstructedMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role === MESSAGE_ROLE.USER ? "User" : "Assistant";
      return `${role}: ${message.content}`;
    })
    .join("\n\n");
}

const platformFormatGuidelines: Record<string, string> = {
  imessage:
    "Keep the summary very short (under 200 characters), use plain text only, no markdown or formatting.",
  slack:
    "You may use Slack mrkdwn: *bold*, _italic_. Keep it concise but informative.",
  discord:
    "You may use Discord markdown: **bold**, *italic*. Keep under 500 characters.",
};

function getPlatformGuideline(platform?: string): string {
  if (!platform) {
    return "Keep the summary concise and use plain text.";
  }
  return (
    platformFormatGuidelines[platform.toLowerCase()] ??
    "Keep the summary concise and use plain text."
  );
}

export async function generateTaskSummary(
  options: GenerateSummaryOptions
): Promise<TaskSummary> {
  const { sessionId, originalTask, platformOrigin } = options;
  const session = await findSessionById(sessionId);

  if (!session?.sandboxSessionId) {
    return {
      success: false,
      outcome: "Session not found",
      summary: "Unable to generate summary - session not found.",
    };
  }

  try {
    const messages = await fetchSessionMessages(sessionId);

    if (messages.length === 0) {
      return buildFallbackSummary(originalTask, messages);
    }

    const conversationText = formatConversationForLLM(messages);
    const formatGuideline = getPlatformGuideline(platformOrigin);

    const prompt = `You are summarizing the outcome of a task that was delegated to an AI assistant.

Original Task:
${originalTask}

Conversation:
${conversationText}

Based on the conversation above, provide a brief summary of:
1. Whether the task was completed successfully
2. What was accomplished
3. Any issues or notes worth mentioning

Formatting: ${formatGuideline}

Respond in this exact JSON format:
{
  "success": true/false,
  "outcome": "Brief one-line description of what happened",
  "summary": "1-2 sentence summary suitable for sending as a notification message"
}

Only output the JSON, no other text.`;

    const result = await complete(prompt);

    try {
      const parsed = JSON.parse(result);
      const parsedSummary =
        typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      if (!parsedSummary) {
        return buildFallbackSummary(originalTask, messages);
      }
      return {
        success: Boolean(parsed.success),
        outcome: String(parsed.outcome || "Task processed"),
        summary: trimForMessage(parsedSummary, LIMITS.SUMMARY_FALLBACK_LENGTH),
      };
    } catch {
      const fallbackFromRaw = result.trim();
      if (fallbackFromRaw) {
        return {
          success: true,
          outcome: "Task completed",
          summary: trimForMessage(
            fallbackFromRaw,
            LIMITS.SUMMARY_FALLBACK_LENGTH
          ),
        };
      }
      return buildFallbackSummary(originalTask, messages);
    }
  } catch (error) {
    widelog.errorFields(error, { prefix: "summary_generator.error" });
    return buildFallbackSummary(originalTask, []);
  }
}
