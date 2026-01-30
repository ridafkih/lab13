import {
  type BrowserSessionState,
  type DaemonController,
  type StateStore,
} from "@lab/browser-protocol";
import { getFirstExposedPort } from "../repositories/container.repository";
import { createBrowserService, type BrowserService } from "./browser-service";
import {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
} from "./state-store";
import {
  start,
  stop,
  navigate,
  getStatus,
  getCurrentUrl,
  launch,
  isHealthy,
} from "./daemon-controller";

export interface BrowserBootstrapConfig {
  browserApiUrl: string;
  browserWsHost: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
  publishFrame: (sessionId: string, frame: string, timestamp: number) => void;
  publishStateChange: (sessionId: string, state: BrowserSessionState) => void;
}

const stateStore: StateStore = {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
};

export const bootstrapBrowserService = async (
  config: BrowserBootstrapConfig,
): Promise<BrowserService> => {
  const baseUrl = config.browserApiUrl;

  const daemonController: DaemonController = {
    start: (sessionId, url) => start(baseUrl, sessionId, url),
    stop: (sessionId) => stop(baseUrl, sessionId),
    navigate: (sessionId, url) => navigate(baseUrl, sessionId, url),
    getStatus: (sessionId) => getStatus(baseUrl, sessionId),
    getCurrentUrl: (sessionId) => getCurrentUrl(baseUrl, sessionId),
    launch: (sessionId) => launch(baseUrl, sessionId),
    isHealthy: () => isHealthy(baseUrl),
  };

  const service = await createBrowserService(
    {
      browserWsHost: config.browserWsHost,
      browserDaemonUrl: baseUrl,
      cleanupDelayMs: config.cleanupDelayMs,
      reconcileIntervalMs: config.reconcileIntervalMs,
      maxRetries: config.maxRetries,
    },
    {
      stateStore,
      daemonController,
      publishFrame: config.publishFrame,
      publishStateChange: config.publishStateChange,
      getFirstExposedPort,
    },
  );

  return service;
};

export const shutdownBrowserService = (service: BrowserService): void => {
  service.stopReconciler();
};
