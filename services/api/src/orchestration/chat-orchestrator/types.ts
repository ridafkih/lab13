import type { ImageStore } from "@lab/context";
import type { AcpClient } from "../../acp/client";
import type { BrowserServiceManager } from "../../managers/browser-service.manager";
import type { PoolManager } from "../../managers/pool.manager";
import type { SessionLifecycleManager } from "../../managers/session-lifecycle.manager";
import type { SessionStateStore } from "../../state/session-state-store";
import type { Publisher } from "../../types/dependencies";

export interface ChatOrchestratorInput {
  content: string;
  conversationHistory?: string[];
  platformOrigin?: string;
  platformChatId?: string;
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  modelId?: string;
  timestamp?: string;
  acp: AcpClient;
  publisher: Publisher;
  imageStore?: ImageStore;
  sessionStateStore: SessionStateStore;
}

export const CHAT_ORCHESTRATOR_ACTION = {
  RESPONSE: "response",
  CREATED_SESSION: "created_session",
  FORWARDED_MESSAGE: "forwarded_message",
} as const;

export type ChatOrchestratorAction =
  (typeof CHAT_ORCHESTRATOR_ACTION)[keyof typeof CHAT_ORCHESTRATOR_ACTION];

export interface ChatOrchestratorResult {
  action: ChatOrchestratorAction;
  message: string;
  messages?: string[];
  sessionId?: string;
  projectName?: string;
  attachments?: import("../tool-result-handler").MessageAttachment[];
}

export interface ChatOrchestratorChunk {
  type: "chunk";
  text: string;
}
