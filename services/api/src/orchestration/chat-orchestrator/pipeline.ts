import type { LanguageModel } from "ai";
import { readModelConfig, createLanguageModel } from "../../shared/llm-factory";
import { buildChatOrchestratorPrompt } from "../system-prompts/chat-orchestrator";
import { getPlatformConfig } from "../../config/platforms";
import { buildOrchestratorTools } from "./tool-builder";
import { getVisionContext } from "./vision-context";
import {
  CHAT_ORCHESTRATOR_ACTION,
  type ChatOrchestratorInput,
  type ChatOrchestratorResult,
} from "./types";
import type { SessionInfo } from "../tool-result-handler";

interface PreparedOrchestration {
  model: LanguageModel;
  tools: Awaited<ReturnType<typeof buildOrchestratorTools>>;
  systemPrompt: string;
  platformConfig: ReturnType<typeof getPlatformConfig>;
  createModelFn: () => LanguageModel;
}

export async function prepareOrchestration(
  input: ChatOrchestratorInput,
): Promise<PreparedOrchestration> {
  const modelConfig = readModelConfig("chatOrchestrator");
  const model = createLanguageModel(modelConfig);
  const vision = await getVisionContext();

  const tools = await buildOrchestratorTools({
    browserService: input.browserService,
    sessionLifecycle: input.sessionLifecycle,
    poolManager: input.poolManager,
    modelId: input.modelId,
    createModel: () => createLanguageModel(modelConfig),
    opencode: input.opencode,
    publisher: input.publisher,
    imageStore: input.imageStore,
    sessionStateStore: input.sessionStateStore,
    visionContext: vision,
  });

  const systemPrompt = buildChatOrchestratorPrompt({
    conversationHistory: input.conversationHistory,
    platformOrigin: input.platformOrigin,
    timestamp: input.timestamp,
  });

  const platformConfig = getPlatformConfig(input.platformOrigin ?? "");

  return {
    model,
    tools,
    systemPrompt,
    platformConfig,
    createModelFn: () => createLanguageModel(modelConfig),
  };
}

export function buildOrchestratorResult(
  text: string,
  messages: string[] | undefined,
  sessionInfo: SessionInfo,
): ChatOrchestratorResult {
  const { sessionId, projectName, wasForwarded, attachments } = sessionInfo;

  if (sessionId && wasForwarded) {
    return {
      action: CHAT_ORCHESTRATOR_ACTION.FORWARDED_MESSAGE,
      message: text || "Message sent to the session.",
      messages,
      sessionId,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  if (sessionId) {
    return {
      action: CHAT_ORCHESTRATOR_ACTION.CREATED_SESSION,
      message: text || `Started working on your task in ${projectName ?? "the project"}.`,
      messages,
      sessionId,
      projectName,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  return {
    action: CHAT_ORCHESTRATOR_ACTION.RESPONSE,
    message: text,
    messages,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
