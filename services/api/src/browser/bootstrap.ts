import {
  type BrowserSessionState,
  type DaemonController,
  type StateStore,
  createDaemonController,
} from "@lab/browser-protocol";
import { TIMING, SERVER } from "../config/constants";
import {
  getFirstExposedPort,
  getFirstExposedService,
} from "../repositories/container-session.repository";
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
import { ExternalServiceError, NotFoundError } from "../shared/errors";

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

async function getInitialNavigationUrl(sessionId: string, _port: number): Promise<string> {
  const service = await getFirstExposedService(sessionId);
  if (!service) {
    throw new NotFoundError("Exposed service", sessionId);
  }
  return `http://${service.hostname}:${service.port}/`;
}

async function waitForService(
  sessionId: string,
  port: number,
  timeoutMs = TIMING.SERVICE_WAIT_TIMEOUT_MS,
  intervalMs = TIMING.SERVICE_WAIT_INTERVAL_MS,
): Promise<void> {
  const proxyUrl = `http://lab-proxy:${SERVER.PROXY_PORT}/`;
  const hostHeader = `${sessionId}--${port}.localhost`;
  const startTime = Date.now();
  let lastStatus: number | string = "no response";

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(proxyUrl, {
      headers: { Host: hostHeader },
    }).catch((err) => {
      lastStatus = `fetch error: ${err.message}`;
      return null;
    });

    if (response) {
      lastStatus = response.status;
      if (response.ok) {
        return;
      }
    }
    await Bun.sleep(intervalMs);
  }

  throw new ExternalServiceError(
    `Service not available: ${sessionId}--${port} (last status: ${lastStatus})`,
    "SERVICE_NOT_AVAILABLE",
  );
}

export interface BrowserBootstrapResult {
  browserService: BrowserService;
  daemonController: DaemonController;
}

export const bootstrapBrowserService = async (
  config: BrowserBootstrapConfig,
): Promise<BrowserBootstrapResult> => {
  const baseUrl = config.browserApiUrl;

  const daemonController = createDaemonController({ baseUrl });

  const browserService = await createBrowserService(
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
      getInitialNavigationUrl,
      waitForService,
    },
  );

  return { browserService, daemonController };
};

export const shutdownBrowserService = (service: BrowserService): void => {
  service.stopReconciler();
};
