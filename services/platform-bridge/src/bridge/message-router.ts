import { apiClient } from "../clients/api";
import { sessionTracker } from "./session-tracker";
import { responseSubscriber } from "./response-subscriber";
import type { IncomingPlatformMessage, MessagingMode, PlatformType } from "../types/messages";
import { getAdapter } from "../platforms";

export class MessageRouter {
  async handleIncomingMessage(message: IncomingPlatformMessage): Promise<void> {
    const { platform, chatId, userId, messageId, content, timestamp } = message;

    console.log(`[MessageRouter] Received message from ${platform}:${chatId}`);

    await this.routeToChatOrchestrator(platform, chatId, userId, messageId, content, timestamp);
  }

  private async routeToChatOrchestrator(
    platform: PlatformType,
    chatId: string,
    userId: string | undefined,
    messageId: string | undefined,
    content: string,
    timestamp: Date,
  ): Promise<void> {
    const adapter = getAdapter(platform);
    const messagingMode: MessagingMode = adapter?.messagingMode ?? "passive";

    const result = await apiClient.chat({
      content,
      platformOrigin: platform,
      platformChatId: chatId,
      timestamp: timestamp.toISOString(),
    });

    if (result.action === "created_session" && result.sessionId) {
      await sessionTracker.setMapping(platform, chatId, result.sessionId, userId, messageId);

      responseSubscriber.subscribeToSession(
        result.sessionId,
        platform,
        chatId,
        messageId,
        messagingMode,
      );

      console.log(
        `[MessageRouter] Created session ${result.sessionId} for project ${result.projectName ?? "unknown"} (mode: ${messagingMode})`,
      );
    }

    if (result.action === "forwarded_message" && result.sessionId) {
      await sessionTracker.touchMapping(platform, chatId);
      console.log(`[MessageRouter] Forwarded message to session ${result.sessionId}`);
    }

    if (adapter && result.message) {
      await adapter.sendMessage({
        platform,
        chatId,
        content: result.message,
        attachments: result.attachments,
      });
    }
  }
}

export const messageRouter = new MessageRouter();
