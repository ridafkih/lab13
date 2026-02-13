import type {
  DaemonController,
  DaemonEvent,
  ErrorHandler,
  Orchestrator,
  OrchestratorConfig,
  StateChangeHandler,
  StateStore,
} from "../types/orchestrator";
import type { BrowserSessionState, SessionSnapshot } from "../types/session";
import { createEventDrivenReconciler } from "./event-driven-reconciler";
import { createSessionManager } from "./session-manager";

export type {
  ErrorHandler,
  Orchestrator,
  OrchestratorConfig,
  StateChangeHandler,
} from "../types/orchestrator";

export const createOrchestrator = (
  stateStore: StateStore,
  daemonController: DaemonController,
  config: OrchestratorConfig
): Orchestrator => {
  const sessions = createSessionManager();
  const stoppedSessions = new Set<string>();
  const stateChangeHandlers: StateChangeHandler[] = [];
  const errorHandlers: ErrorHandler[] = [];

  const notifyStateChange = (sessionId: string, state: BrowserSessionState) => {
    for (const stateChangeHandler of stateChangeHandlers) {
      stateChangeHandler(sessionId, state);
    }
  };

  const notifyError = (error: unknown) => {
    for (const errorHandler of errorHandlers) {
      errorHandler(error);
    }
  };

  const notifyingStateStore: StateStore = {
    ...stateStore,
    async setCurrentState(sessionId, currentState, options) {
      const state = await stateStore.setCurrentState(
        sessionId,
        currentState,
        options
      );
      notifyStateChange(sessionId, state);
      return state;
    },
    async setDesiredState(sessionId, desiredState) {
      const state = await stateStore.setDesiredState(sessionId, desiredState);
      notifyStateChange(sessionId, state);
      return state;
    },
  };

  const reconciler = createEventDrivenReconciler(
    notifyingStateStore,
    daemonController,
    {
      maxRetries: config.maxRetries,
      getFirstExposedPort: config.getFirstExposedPort,
      getInitialNavigationUrl: config.getInitialNavigationUrl,
      waitForService: config.waitForService,
    }
  );

  const getSnapshot = async (sessionId: string): Promise<SessionSnapshot> => {
    const dbState = await stateStore.getState(sessionId);
    const subscriberCount = sessions.getSubscriberCount(sessionId);

    if (!dbState) {
      return {
        sessionId,
        desiredState: "stopped",
        currentState: "stopped",
        subscriberCount,
      };
    }

    return {
      sessionId: dbState.sessionId,
      desiredState: dbState.desiredState,
      currentState: dbState.currentState,
      streamPort: dbState.streamPort ?? undefined,
      errorMessage: dbState.errorMessage ?? undefined,
      subscriberCount,
    };
  };

  return {
    async subscribe(sessionId) {
      sessions.clearCleanupTimer(sessionId);
      const count = sessions.incrementSubscribers(sessionId);

      if (count === 1) {
        await notifyingStateStore.setDesiredState(sessionId, "running");
        await reconciler.handleDesiredStateChange(sessionId);
      }

      return getSnapshot(sessionId);
    },

    async warmUp(sessionId) {
      await notifyingStateStore.setDesiredState(sessionId, "running");
      await reconciler.handleDesiredStateChange(sessionId);
      return getSnapshot(sessionId);
    },

    unsubscribe(sessionId) {
      const count = sessions.decrementSubscribers(sessionId);

      if (count === 0) {
        sessions.setCleanupTimer(
          sessionId,
          async () => {
            if (sessions.getSubscriberCount(sessionId) === 0) {
              sessions.resetSession(sessionId);
              try {
                await notifyingStateStore.setDesiredState(sessionId, "stopped");
                await reconciler.handleDesiredStateChange(sessionId);
              } catch (error) {
                console.warn(
                  `[Orchestrator] Failed to set desired state for ${sessionId}:`,
                  error
                );
              }
            }
          },
          config.cleanupDelayMs
        );
      }

      return getSnapshot(sessionId);
    },

    async forceStop(sessionId) {
      stoppedSessions.add(sessionId);
      sessions.delete(sessionId);
      try {
        await daemonController.stop(sessionId);
      } catch (error) {
        console.warn(
          `[Orchestrator] Failed to stop daemon for ${sessionId}:`,
          error
        );
      }
      await stateStore.deleteSession(sessionId);
    },

    getSnapshot,

    getCachedFrame: (sessionId) => sessions.getFrame(sessionId),

    setCachedFrame: (sessionId, frame) => sessions.setFrame(sessionId, frame),

    launchBrowser: (sessionId) => daemonController.launch(sessionId),

    startReconciler: () => {
      /* no-op */
    },

    stopReconciler: () => {
      /* no-op */
    },

    onStateChange: (handler) => stateChangeHandlers.push(handler),

    onError: (handler) => errorHandlers.push(handler),

    async handleDaemonEvent(event: DaemonEvent) {
      if (stoppedSessions.has(event.sessionId)) {
        return;
      }

      try {
        await reconciler.handleDaemonEvent(event);
      } catch (error) {
        if (stoppedSessions.has(event.sessionId)) {
          return;
        }
        notifyError(error);
      }
    },
  };
};
