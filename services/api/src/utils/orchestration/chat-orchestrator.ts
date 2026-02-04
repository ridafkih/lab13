import { generateText, stepCountIs, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  listProjectsTool,
  listSessionsTool,
  getSessionMessagesTool,
  getSessionStatusTool,
  searchSessionsTool,
  getContainersTool,
  createCreateSessionTool,
  createSendMessageToSessionTool,
  createGetSessionScreenshotTool,
} from "./tools";
import { buildChatOrchestratorPrompt } from "./prompts/chat-orchestrator";
import type { BrowserService } from "../browser/browser-service";

export interface ChatOrchestratorInput {
  content: string;
  conversationHistory?: string[];
  platformOrigin?: string;
  platformChatId?: string;
  browserService: BrowserService;
  modelId?: string;
  timestamp?: string;
}

export type ChatOrchestratorAction = "response" | "created_session" | "forwarded_message";

export interface MessageAttachment {
  type: "image";
  data: string;
  encoding: "base64";
  format: string;
}

export interface ChatOrchestratorResult {
  action: ChatOrchestratorAction;
  message: string;
  sessionId?: string;
  projectName?: string;
  attachments?: MessageAttachment[];
}

interface ChatModelConfig {
  provider: string;
  model: string;
  apiKey: string;
}

function getChatModelConfig(): ChatModelConfig {
  const provider = process.env.CHAT_ORCHESTRATOR_MODEL_PROVIDER;
  const model = process.env.CHAT_ORCHESTRATOR_MODEL_NAME;
  const apiKey = process.env.CHAT_ORCHESTRATOR_MODEL_API_KEY;

  if (!provider || !model || !apiKey) {
    throw new Error(
      "Missing chat orchestrator model config. Set CHAT_ORCHESTRATOR_MODEL_PROVIDER, CHAT_ORCHESTRATOR_MODEL_NAME, and CHAT_ORCHESTRATOR_MODEL_API_KEY",
    );
  }

  return { provider, model, apiKey };
}

function createModel(config: ChatModelConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    default:
      throw new Error(`Unsupported chat orchestrator provider: ${config.provider}`);
  }
}

interface SessionInfo {
  sessionId?: string;
  projectName?: string;
  wasForwarded?: boolean;
  attachments: MessageAttachment[];
}

function isSessionCreationOutput(
  value: unknown,
): value is { sessionId: string; projectName: string } {
  if (typeof value !== "object" || value === null) return false;
  return (
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "projectName" in value &&
    typeof value.projectName === "string"
  );
}

function isMessageForwardedOutput(
  value: unknown,
): value is { success: boolean; sessionId: string } {
  if (typeof value !== "object" || value === null) return false;
  return (
    "success" in value &&
    value.success === true &&
    "sessionId" in value &&
    typeof value.sessionId === "string"
  );
}

interface ScreenshotData {
  data: string;
  encoding: "base64";
  format: string;
}

function isScreenshotOutput(
  value: unknown,
): value is { hasScreenshot: true; screenshot: ScreenshotData } {
  if (typeof value !== "object" || value === null) return false;
  if (!("hasScreenshot" in value) || value.hasScreenshot !== true) return false;
  if (!("screenshot" in value)) return false;

  const screenshot = value.screenshot;
  if (typeof screenshot !== "object" || screenshot === null) return false;
  return (
    "data" in screenshot &&
    typeof screenshot.data === "string" &&
    "encoding" in screenshot &&
    screenshot.encoding === "base64" &&
    "format" in screenshot &&
    typeof screenshot.format === "string"
  );
}

function extractSessionInfoFromSteps<T extends { toolResults?: Array<{ output: unknown }> }>(
  steps: T[],
): SessionInfo {
  const attachments: MessageAttachment[] = [];
  let sessionId: string | undefined;
  let projectName: string | undefined;
  let wasForwarded: boolean | undefined;

  for (const step of steps) {
    if (!step.toolResults) continue;

    for (const toolResult of step.toolResults) {
      if (isSessionCreationOutput(toolResult.output)) {
        sessionId = toolResult.output.sessionId;
        projectName = toolResult.output.projectName;
        wasForwarded = false;
      }

      if (isMessageForwardedOutput(toolResult.output)) {
        sessionId = toolResult.output.sessionId;
        wasForwarded = true;
      }

      if (isScreenshotOutput(toolResult.output)) {
        attachments.push({
          type: "image",
          data: toolResult.output.screenshot.data,
          encoding: toolResult.output.screenshot.encoding,
          format: toolResult.output.screenshot.format,
        });
      }
    }
  }

  return { sessionId, projectName, wasForwarded, attachments };
}

export async function chatOrchestrate(
  input: ChatOrchestratorInput,
): Promise<ChatOrchestratorResult> {
  const config = getChatModelConfig();
  const model = createModel(config);

  const createSessionTool = createCreateSessionTool({
    browserService: input.browserService,
    modelId: input.modelId,
  });

  const sendMessageToSessionTool = createSendMessageToSessionTool({
    modelId: input.modelId,
  });

  const getSessionScreenshotTool = createGetSessionScreenshotTool({
    browserService: input.browserService,
  });

  const tools = {
    listProjects: listProjectsTool,
    listSessions: listSessionsTool,
    getSessionMessages: getSessionMessagesTool,
    getSessionStatus: getSessionStatusTool,
    searchSessions: searchSessionsTool,
    getContainers: getContainersTool,
    createSession: createSessionTool,
    sendMessageToSession: sendMessageToSessionTool,
    getSessionScreenshot: getSessionScreenshotTool,
  };

  const systemPrompt = buildChatOrchestratorPrompt({
    conversationHistory: input.conversationHistory,
    platformOrigin: input.platformOrigin,
    timestamp: input.timestamp,
  });

  const { text, steps } = await generateText({
    model,
    tools,
    prompt: input.content,
    system: systemPrompt,
    stopWhen: stepCountIs(5),
  });

  const { sessionId, projectName, wasForwarded, attachments } = extractSessionInfoFromSteps(steps);

  if (sessionId && wasForwarded) {
    return {
      action: "forwarded_message",
      message: text || "Message sent to the session.",
      sessionId,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  if (sessionId) {
    return {
      action: "created_session",
      message: text || `Started working on your task in ${projectName ?? "the project"}.`,
      sessionId,
      projectName,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  return {
    action: "response",
    message: text,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
