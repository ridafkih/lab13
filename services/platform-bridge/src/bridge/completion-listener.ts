import { multiplayerClient } from "../clients/multiplayer";
import { apiClient } from "../clients/api";
import { getAdapter } from "../platforms";
import { responseSubscriber } from "./response-subscriber";

interface SessionCompleteEvent {
  sessionId: string;
  completedAt: number;
}

class CompletionListener {
  private processingSet = new Set<string>();
  private unsubscribers = new Map<string, () => void>();

  subscribeToSession(sessionId: string): void {
    if (this.unsubscribers.has(sessionId)) {
      return;
    }

    const unsubscribe = multiplayerClient.subscribeToSessionComplete(sessionId, (event) => {
      this.handleSessionComplete(event);
    });

    this.unsubscribers.set(sessionId, unsubscribe);
    console.log(`[CompletionListener] Subscribed to completion for session ${sessionId}`);
  }

  unsubscribeFromSession(sessionId: string): void {
    const unsubscribe = this.unsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(sessionId);
      console.log(`[CompletionListener] Unsubscribed from completion for session ${sessionId}`);
    }
  }

  private async handleSessionComplete(event: SessionCompleteEvent): Promise<void> {
    const { sessionId } = event;

    if (this.processingSet.has(sessionId)) {
      console.log(`[CompletionListener] Already processing session ${sessionId}, skipping`);
      return;
    }

    this.processingSet.add(sessionId);

    try {
      console.log(`[CompletionListener] Processing completion for session ${sessionId}`);

      const subscriptions = responseSubscriber.getActiveSubscriptions();
      const subscription = subscriptions.get(sessionId);

      if (!subscription) {
        console.log(`[CompletionListener] No subscription found for session ${sessionId}`);
        return;
      }

      const { platform, chatId } = subscription;

      const result = await apiClient.notifySessionComplete({
        sessionId,
        platformOrigin: platform,
        platformChatId: chatId,
      });

      const adapter = getAdapter(platform);
      if (!adapter) {
        console.warn(`[CompletionListener] No adapter for platform ${platform}`);
        return;
      }

      const threadId = responseSubscriber.getThreadId(sessionId);

      await adapter.sendMessage({
        platform,
        chatId,
        content: result.message,
        threadId,
        attachments: result.attachments,
      });

      console.log(
        `[CompletionListener] Sent completion summary to ${platform}:${chatId}` +
          (result.attachments?.length ? ` with ${result.attachments.length} attachment(s)` : ""),
      );
    } catch (error) {
      console.error(`[CompletionListener] Error processing completion for ${sessionId}:`, error);
    } finally {
      this.processingSet.delete(sessionId);
    }
  }
}

export const completionListener = new CompletionListener();
