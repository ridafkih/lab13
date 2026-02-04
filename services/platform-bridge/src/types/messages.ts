export type PlatformType = "imessage" | "slack" | "discord";

export interface IncomingPlatformMessage {
  platform: PlatformType;
  chatId: string;
  userId?: string;
  messageId?: string;
  content: string;
  timestamp: Date;
  metadata?: {
    isGroupChat?: boolean;
    senderName?: string;
    conversationHistory?: string[];
    [key: string]: unknown;
  };
}

export interface MessageAttachment {
  type: "image";
  data: string;
  encoding: "base64";
  format: string;
}

export interface OutgoingPlatformMessage {
  platform: PlatformType;
  chatId: string;
  content: string;
  threadId?: string;
  attachments?: MessageAttachment[];
}

export type MessagingMode = "active" | "passive";

export interface OrchestrationRequest {
  content: string;
  channelId?: string;
  modelId?: string;
  platformOrigin?: string;
  platformChatId?: string;
  messagingMode?: MessagingMode;
  conversationHistory?: string[];
}

export interface OrchestrationResult {
  orchestrationId: string;
  sessionId: string;
  projectId: string;
  projectName: string;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  senderId: string;
}

export type ChatAction = "response" | "created_session" | "forwarded_message";

export interface ChatRequest {
  content: string;
  platformOrigin: string;
  platformChatId: string;
  modelId?: string;
  timestamp?: string;
}

export interface ChatResult {
  action: ChatAction;
  message: string;
  sessionId?: string;
  projectName?: string;
  attachments?: MessageAttachment[];
}
