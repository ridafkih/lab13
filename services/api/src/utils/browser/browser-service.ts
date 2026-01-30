import {
  type Orchestrator,
  type BrowserSessionState,
  type SessionSnapshot,
  type StateStore,
  type DaemonController,
  type FrameReceiver,
  createOrchestrator,
} from "@lab/browser-protocol";
import { createFrameReceiver } from "./frame-receiver";
import { createDaemonEventSubscriber } from "./daemon-event-subscriber";

export interface BrowserServiceConfig {
  browserWsHost: string;
  browserDaemonUrl: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
}

export interface BrowserServiceDependencies {
  stateStore: StateStore;
  daemonController: DaemonController;
  publishFrame: (sessionId: string, frame: string, timestamp: number) => void;
  publishStateChange: (sessionId: string, state: BrowserSessionState) => void;
  getFirstExposedPort?: (sessionId: string) => Promise<number | null>;
}

export interface BrowserService {
  getBrowserSnapshot(sessionId: string): Promise<SessionSnapshot>;
  subscribeBrowser(sessionId: string): Promise<SessionSnapshot>;
  unsubscribeBrowser(sessionId: string): Promise<SessionSnapshot>;
  forceStopBrowser(sessionId: string): Promise<void>;
  getCachedFrame(sessionId: string): string | null;
  startReconciler(): void;
  stopReconciler(): void;
}

export const createBrowserService = async (
  config: BrowserServiceConfig,
  deps: BrowserServiceDependencies,
): Promise<BrowserService> => {
  const { stateStore, daemonController, publishFrame, publishStateChange } = deps;
  const { browserWsHost, browserDaemonUrl, cleanupDelayMs, reconcileIntervalMs, maxRetries } =
    config;

  const eventSubscriber = createDaemonEventSubscriber({ browserDaemonUrl });

  const frameReceivers = new Map<string, FrameReceiver>();

  const connectFrameReceiver = async (
    sessionId: string,
    port: number,
    orchestrator: Orchestrator,
  ) => {
    if (frameReceivers.has(sessionId)) return;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.running) {
      console.warn(`[FrameReceiver] Daemon not running for ${sessionId}, resetting state`);
      await stateStore.setCurrentState(sessionId, "stopped", { streamPort: null });
      return;
    }

    await daemonController.launch(sessionId);

    const receiver = createFrameReceiver(
      port,
      (frame, timestamp) => {
        orchestrator.setCachedFrame(sessionId, frame);
        publishFrame(sessionId, frame, timestamp);
      },
      () => frameReceivers.delete(sessionId),
      { wsHost: browserWsHost },
    );

    frameReceivers.set(sessionId, receiver);
  };

  const disconnectFrameReceiver = (sessionId: string) => {
    const receiver = frameReceivers.get(sessionId);
    if (!receiver) return;
    receiver.close();
    frameReceivers.delete(sessionId);
  };

  const orchestrator = createOrchestrator(stateStore, daemonController, {
    maxRetries,
    reconcileIntervalMs,
    cleanupDelayMs,
    getFirstExposedPort: deps.getFirstExposedPort,
  });

  orchestrator.onStateChange((sessionId: string, state: BrowserSessionState) => {
    publishStateChange(sessionId, state);

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

  eventSubscriber.onEvent((event) => {
    orchestrator.handleDaemonEvent(event).catch((error) => {
      console.error("[BrowserOrchestrator] Failed to handle daemon event:", error);
    });
  });

  return {
    async getBrowserSnapshot(sessionId: string) {
      const snapshot = await orchestrator.getSnapshot(sessionId);
      return {
        sessionId: snapshot.sessionId,
        desiredState: snapshot.desiredState,
        currentState: snapshot.currentState,
        streamPort: snapshot.streamPort,
        errorMessage: snapshot.errorMessage,
        subscriberCount: snapshot.subscriberCount,
      };
    },

    async subscribeBrowser(sessionId: string) {
      const snapshot = await orchestrator.subscribe(sessionId);

      if (snapshot.currentState === "running" && snapshot.streamPort) {
        connectFrameReceiver(sessionId, snapshot.streamPort, orchestrator).catch((error) =>
          console.error("[FrameReceiver] Failed to connect:", error),
        );
      }

      return snapshot;
    },

    unsubscribeBrowser(sessionId: string) {
      return orchestrator.unsubscribe(sessionId);
    },

    async forceStopBrowser(sessionId: string) {
      await orchestrator.forceStop(sessionId);
    },

    getCachedFrame(sessionId: string) {
      return orchestrator.getCachedFrame(sessionId);
    },

    startReconciler() {
      eventSubscriber.start();
    },

    stopReconciler() {
      eventSubscriber.stop();
    },
  };
};
