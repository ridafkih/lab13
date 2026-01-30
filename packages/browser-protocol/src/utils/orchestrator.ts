import { type BrowserSessionState, type SessionSnapshot } from "../types/session";
import type {
  StateStore,
  DaemonController,
  Orchestrator,
  OrchestratorConfig,
  StateChangeHandler,
  ErrorHandler,
  DaemonEvent,
} from "../types/orchestrator";
import { createEventDrivenReconciler } from "./event-driven-reconciler";
import { createSessionManager } from "./session-manager";

export type { Orchestrator, OrchestratorConfig, StateChangeHandler, ErrorHandler } from "../types/orchestrator";

export const createOrchestrator = (
  stateStore: StateStore,
  daemonController: DaemonController,
  config: OrchestratorConfig,
): Orchestrator => {
  const sessions = createSessionManager();
  const stateChangeHandlers: StateChangeHandler[] = [];
  const errorHandlers: ErrorHandler[] = [];

  const notifyStateChange = (sessionId: string, state: BrowserSessionState) =>
    stateChangeHandlers.forEach((h) => h(sessionId, state));

  const notifyError = (error: unknown) => errorHandlers.forEach((h) => h(error));

  const notifyingStateStore: StateStore = {
    ...stateStore,
    async setCurrentState(sessionId, currentState, options) {
      const state = await stateStore.setCurrentState(sessionId, currentState, options);
      notifyStateChange(sessionId, state);
      return state;
    },
    async setDesiredState(sessionId, desiredState) {
      const state = await stateStore.setDesiredState(sessionId, desiredState);
      notifyStateChange(sessionId, state);
      return state;
    },
  };

  const reconciler = createEventDrivenReconciler(notifyingStateStore, daemonController, {
    maxRetries: config.maxRetries,
    getFirstExposedPort: config.getFirstExposedPort,
  });

  const getSnapshot = async (sessionId: string): Promise<SessionSnapshot> => {
    const dbState = await stateStore.getState(sessionId);
    const subscriberCount = sessions.getSubscriberCount(sessionId);

    if (!dbState) {
      return { sessionId, desiredState: "stopped", currentState: "stopped", subscriberCount };
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

    async unsubscribe(sessionId) {
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
                console.warn(`[Orchestrator] Failed to set desired state for ${sessionId}:`, error);
              }
            }
          },
          config.cleanupDelayMs,
        );
      }

      return getSnapshot(sessionId);
    },

    async forceStop(sessionId) {
      sessions.delete(sessionId);
      try {
        await daemonController.stop(sessionId);
      } catch (error) {
        console.warn(`[Orchestrator] Failed to stop daemon for ${sessionId}:`, error);
      }
      await stateStore.deleteSession(sessionId);
    },

    getSnapshot,

    getCachedFrame: (sessionId) => sessions.getFrame(sessionId),

    setCachedFrame: (sessionId, frame) => sessions.setFrame(sessionId, frame),

    launchBrowser: (sessionId) => daemonController.launch(sessionId),

    startReconciler: () => {},

    stopReconciler: () => {},

    onStateChange: (handler) => stateChangeHandlers.push(handler),

    onError: (handler) => errorHandlers.push(handler),

    async handleDaemonEvent(event: DaemonEvent) {
      try {
        await reconciler.handleDaemonEvent(event);
      } catch (error) {
        notifyError(error);
      }
    },
  };
};
