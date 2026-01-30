import { publisher } from "../publisher";
import {
  type Orchestrator,
  type BrowserSessionState,
  createOrchestrator,
  createPortAllocator,
} from "@lab/browser-orchestration";
import { createDbStateStore } from "./db-state-store";
import { createHttpDaemonController } from "./daemon-controller";
import { createFrameReceiver, type FrameReceiver } from "./frame-receiver";

const BROWSER_API_URL = process.env.BROWSER_API_URL;
if (!BROWSER_API_URL) {
  throw new Error("BROWSER_API_URL must be defined");
}

const CLEANUP_DELAY_MS = parseInt(process.env.BROWSER_CLEANUP_DELAY_MS ?? "10000", 10);
const RECONCILE_INTERVAL_MS = parseInt(process.env.RECONCILE_INTERVAL_MS ?? "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_DAEMON_RETRIES ?? "3", 10);

const stateStore = createDbStateStore();
const daemonController = createHttpDaemonController({ baseUrl: BROWSER_API_URL });

const frameReceivers = new Map<string, FrameReceiver>();

const connectFrameReceiver = async (
  sessionId: string,
  port: number,
  orchestrator: Orchestrator,
) => {
  if (frameReceivers.has(sessionId)) return;

  await daemonController.launch(sessionId);

  const receiver = createFrameReceiver(
    sessionId,
    port,
    (frame, timestamp) => {
      orchestrator.setCachedFrame(sessionId, frame);
      try {
        const parsed = JSON.parse(frame);
        publisher.publishEvent(
          "sessionBrowserFrames",
          { uuid: sessionId },
          {
            type: "frame" as const,
            data: parsed.data,
            timestamp,
          },
        );
      } catch (error) {
        console.error("[FrameReceiver] Failed to parse frame:", error);
      }
    },
    () => frameReceivers.delete(sessionId),
  );

  frameReceivers.set(sessionId, receiver);
};

const disconnectFrameReceiver = (sessionId: string) => {
  const receiver = frameReceivers.get(sessionId);
  if (!receiver) return;
  receiver.close();
  frameReceivers.delete(sessionId);
};

const initializePortAllocator = async () => {
  const sessions = await stateStore.getAllSessions();
  const allocatedPorts = sessions.map((s) => s.streamPort).filter((p): p is number => p !== null);
  return createPortAllocator(undefined, allocatedPorts);
};

let orchestratorPromise: Promise<Orchestrator> | null = null;

const createBrowserOrchestrator = async (): Promise<Orchestrator> => {
  const portAllocator = await initializePortAllocator();

  const orchestrator = createOrchestrator(stateStore, daemonController, portAllocator, {
    maxRetries: MAX_RETRIES,
    reconcileIntervalMs: RECONCILE_INTERVAL_MS,
    cleanupDelayMs: CLEANUP_DELAY_MS,
  });

  orchestrator.onStateChange((sessionId: string, state: BrowserSessionState) => {
    publisher.publishSnapshot(
      "sessionBrowserState",
      { uuid: sessionId },
      {
        desiredState: state.desiredState,
        currentState: state.currentState,
        streamPort: state.streamPort ?? undefined,
        errorMessage: state.errorMessage ?? undefined,
      },
    );

    if (state.currentState === "running" && state.streamPort) {
      connectFrameReceiver(sessionId, state.streamPort, orchestrator).catch((error) =>
        console.error("[FrameReceiver] Failed to connect:", error),
      );
    } else {
      disconnectFrameReceiver(sessionId);
    }
  });

  orchestrator.onError((error: unknown) => {
    console.error("[BrowserOrchestrator] Reconciliation error:", error);
  });

  return orchestrator;
};

const getOrchestrator = (): Promise<Orchestrator> => {
  if (!orchestratorPromise) {
    orchestratorPromise = createBrowserOrchestrator();
  }
  return orchestratorPromise;
};

export const getBrowserSnapshot = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  const snapshot = await orchestrator.getSnapshot(sessionId);
  return {
    desiredState: snapshot.desiredState,
    currentState: snapshot.currentState,
    streamPort: snapshot.streamPort,
    errorMessage: snapshot.errorMessage,
  };
};

export const subscribeBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.subscribe(sessionId);
};

export const unsubscribeBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.unsubscribe(sessionId);
};

export const forceStopBrowser = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  await orchestrator.forceStop(sessionId);
};

export const getCachedFrame = async (sessionId: string) => {
  const orchestrator = await getOrchestrator();
  return orchestrator.getCachedFrame(sessionId);
};

export const startReconciler = async () => {
  const orchestrator = await getOrchestrator();
  orchestrator.startReconciler();
};

export const stopReconciler = async () => {
  const orchestrator = await getOrchestrator();
  orchestrator.stopReconciler();
};
