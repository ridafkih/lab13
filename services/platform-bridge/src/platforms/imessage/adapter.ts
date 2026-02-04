import { IMessageSDK, type Message } from "@photon-ai/imessage-kit";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { PlatformAdapter, MessageHandler } from "../types";
import type { OutgoingPlatformMessage, MessageAttachment } from "../../types/messages";
import { config } from "../../config/environment";

export class IMessageAdapter implements PlatformAdapter {
  readonly platform = "imessage" as const;
  readonly messagingMode = "passive" as const;
  private sdk: IMessageSDK | null = null;
  private handler: MessageHandler | null = null;
  private watchedContacts: Set<string>;

  constructor() {
    this.watchedContacts = new Set(config.imessageWatchedContacts);
  }

  async initialize(): Promise<void> {
    if (!config.imessageEnabled) {
      console.log("[iMessage] Adapter disabled via config");
      return;
    }

    this.sdk = new IMessageSDK();
    console.log("[iMessage] Adapter initialized (direct SDK)");
  }

  async startListening(handler: MessageHandler): Promise<void> {
    if (!this.sdk) {
      console.warn("[iMessage] Cannot start listening - adapter not initialized");
      return;
    }

    this.handler = handler;

    await this.sdk.startWatching({
      onNewMessage: async (message: Message) => {
        console.log("[iMessage] Received message:", message.guid, message.text?.slice(0, 50));

        if (message.isFromMe) return;
        if (!this.shouldMonitor(message.chatId)) return;
        if (!this.handler) return;
        if (!message.text) return;

        const history = await this.getConversationHistory(message.chatId);

        await this.handler({
          platform: "imessage",
          chatId: message.chatId,
          userId: message.sender,
          messageId: message.guid,
          content: message.text,
          timestamp: new Date(message.date),
          metadata: {
            isGroupChat: message.isGroupChat,
            senderName: message.sender,
            conversationHistory: history,
          },
        });
      },
      onGroupMessage: async (message: Message) => {
        console.log("[iMessage] Received group message:", message.guid, message.text?.slice(0, 50));

        if (message.isFromMe) return;
        if (!this.shouldMonitor(message.chatId)) return;
        if (!this.handler) return;
        if (!message.text) return;

        const history = await this.getConversationHistory(message.chatId);

        await this.handler({
          platform: "imessage",
          chatId: message.chatId,
          userId: message.sender,
          messageId: message.guid,
          content: message.text,
          timestamp: new Date(message.date),
          metadata: {
            isGroupChat: message.isGroupChat,
            senderName: message.sender,
            conversationHistory: history,
          },
        });
      },
      onError: (error: Error) => {
        console.error("[iMessage] SDK error:", error);
      },
    });

    console.log("[iMessage] Started listening for messages");
    if (this.watchedContacts.size > 0) {
      console.log("[iMessage] Filtering to contacts:", Array.from(this.watchedContacts));
    }
  }

  async stopListening(): Promise<void> {
    if (this.sdk) {
      this.sdk.stopWatching();
      await this.sdk.close();
      console.log("[iMessage] Stopped listening");
    }
    this.handler = null;
  }

  async sendMessage(message: OutgoingPlatformMessage): Promise<void> {
    if (!this.sdk) {
      throw new Error("iMessage adapter not initialized");
    }

    const attachmentPaths: string[] = [];

    try {
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          const filePath = await this.writeAttachmentToTempFile(attachment);
          attachmentPaths.push(filePath);
        }
      }

      if (attachmentPaths.length > 0) {
        await this.sdk.send(message.chatId, {
          text: message.content || undefined,
          images: attachmentPaths,
        });
      } else {
        await this.sdk.send(message.chatId, message.content);
      }

      console.log(`[iMessage] Sent message to ${message.chatId}`);
    } finally {
      for (const filePath of attachmentPaths) {
        try {
          await unlink(filePath);
        } catch {
          console.warn(`[iMessage] Failed to clean up temp file: ${filePath}`);
        }
      }
    }
  }

  private async writeAttachmentToTempFile(attachment: MessageAttachment): Promise<string> {
    const tempDir = join(tmpdir(), "lab-imessage-attachments");
    await mkdir(tempDir, { recursive: true });

    const extension = attachment.format === "png" ? "png" : attachment.format;
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = join(tempDir, fileName);

    const buffer = Buffer.from(attachment.data, attachment.encoding);
    await writeFile(filePath, buffer);

    return filePath;
  }

  shouldMonitor(chatId: string): boolean {
    if (this.watchedContacts.size === 0) return true;
    return this.watchedContacts.has(chatId);
  }

  private async getConversationHistory(chatId: string): Promise<string[]> {
    if (!this.sdk) return [];

    const result = await this.sdk.getMessages({
      chatId,
      limit: config.imessageContextMessages,
    });

    return result.messages.map((msg) => `${msg.isFromMe ? "Me" : msg.sender}: ${msg.text}`);
  }
}

export const imessageAdapter = new IMessageAdapter();
