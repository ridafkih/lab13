import type { ImageStore } from "@lab/context";
import type { ImageAnalyzerContext } from "@lab/subagents/vision/types";
import type { LanguageModel } from "ai";
import type { AcpClient } from "../../acp/client";
import type { BrowserServiceManager } from "../../managers/browser-service.manager";
import type { PoolManager } from "../../managers/pool.manager";
import type { SessionLifecycleManager } from "../../managers/session-lifecycle.manager";
import type { SessionStateStore } from "../../state/session-state-store";
import type { Publisher } from "../../types/dependencies";
import { createCreateSessionTool } from "../tools/create-session";
import { getContainersTool } from "../tools/get-containers";
import { createGetSessionMessagesTool } from "../tools/get-session-messages";
import { createGetSessionScreenshotTool } from "../tools/get-session-screenshot";
import { createGetSessionStatusTool } from "../tools/get-session-status";
import { listProjectsTool } from "../tools/list-projects";
import { listSessionsTool } from "../tools/list-sessions";
import { createRunBrowserTaskTool } from "../tools/run-browser-task";
import { createSearchSessionsTool } from "../tools/search-sessions";
import { createSendMessageToSessionTool } from "../tools/send-message-to-session";

interface BuildOrchestratorToolsConfig {
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  modelId?: string;
  createModel: () => LanguageModel;
  imageStore?: ImageStore;
  visionContext?: ImageAnalyzerContext;
  acp: AcpClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

export async function buildOrchestratorTools(
  toolsConfig: BuildOrchestratorToolsConfig
) {
  const createSessionTool = createCreateSessionTool({
    browserService: toolsConfig.browserService,
    sessionLifecycle: toolsConfig.sessionLifecycle,
    poolManager: toolsConfig.poolManager,
    modelId: toolsConfig.modelId,
    acp: toolsConfig.acp,
    publisher: toolsConfig.publisher,
    sessionStateStore: toolsConfig.sessionStateStore,
  });

  const sendMessageToSessionTool = createSendMessageToSessionTool({
    modelId: toolsConfig.modelId,
    acp: toolsConfig.acp,
    publisher: toolsConfig.publisher,
    sessionStateStore: toolsConfig.sessionStateStore,
  });

  const getSessionStatusTool = createGetSessionStatusTool(
    toolsConfig.sessionStateStore
  );

  const getSessionScreenshotTool = createGetSessionScreenshotTool({
    daemonController: toolsConfig.browserService.daemonController,
    imageStore: toolsConfig.imageStore,
  });

  const runBrowserTaskTool = createRunBrowserTaskTool({
    daemonController: toolsConfig.browserService.daemonController,
    createModel: toolsConfig.createModel,
    imageStore: toolsConfig.imageStore,
  });

  const getSessionMessagesTool = createGetSessionMessagesTool();
  const searchSessionsTool = createSearchSessionsTool();

  const baseTools = {
    listProjects: listProjectsTool,
    listSessions: listSessionsTool,
    getSessionMessages: getSessionMessagesTool,
    getSessionStatus: getSessionStatusTool,
    searchSessions: searchSessionsTool,
    getContainers: getContainersTool,
    createSession: createSessionTool,
    sendMessageToSession: sendMessageToSessionTool,
    getSessionScreenshot: getSessionScreenshotTool,
    runBrowserTask: runBrowserTaskTool,
  };

  if (toolsConfig.visionContext) {
    const { createAnalyzeImageTool } = await import(
      "@lab/subagents/vision/tool"
    );
    return {
      ...baseTools,
      analyzeImage: createAnalyzeImageTool(toolsConfig.visionContext),
    };
  }

  return baseTools;
}
