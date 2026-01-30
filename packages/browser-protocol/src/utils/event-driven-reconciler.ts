import type { BrowserSessionState, CurrentState } from "../types/session";
import type { StateStore, StateStoreOptions, DaemonController, ReconcilerConfig, DaemonEvent } from "../types/orchestrator";
import { computeRequiredAction, type Action } from "./state-machine";

export interface EventDrivenReconciler {
  handleDesiredStateChange(sessionId: string): Promise<void>;
  handleDaemonEvent(event: DaemonEvent): Promise<void>;
}

export const createEventDrivenReconciler = (
  stateStore: StateStore,
  daemonController: DaemonController,
  config: ReconcilerConfig,
): EventDrivenReconciler => {
  const updateCurrentState = (
    sessionId: string,
    currentState: CurrentState,
    options: StateStoreOptions = {},
  ): Promise<BrowserSessionState> => {
    return stateStore.setCurrentState(sessionId, currentState, options);
  };

  const startSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId, retryCount } = session;

    if (retryCount >= config.maxRetries) return;

    await updateCurrentState(sessionId, "starting", {
      retryCount: retryCount + 1,
      errorMessage: null,
    });

    try {
      const { port } = await daemonController.start(sessionId, session.lastUrl ?? undefined);
      await updateCurrentState(sessionId, "starting", { streamPort: port });
    } catch (error) {
      await updateCurrentState(sessionId, "stopped", {
        streamPort: null,
        errorMessage: error instanceof Error ? error.message : "Failed to start daemon",
      });
    }
  };

  const stopSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const currentUrl = await daemonController.getCurrentUrl(sessionId);
    if (currentUrl && currentUrl !== "about:blank") {
      await stateStore.setLastUrl(sessionId, currentUrl);
    }

    await updateCurrentState(sessionId, "stopping");
    await daemonController.stop(sessionId);

    await updateCurrentState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
      retryCount: 0,
    });
  };

  const resetToStopped = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    await updateCurrentState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
    });
  };

  const executeAction = async (session: BrowserSessionState, action: Action): Promise<void> => {
    switch (action) {
      case "StartDaemon":
        return startSession(session);
      case "StopDaemon":
        return stopSession(session);
      case "ResetToStopped":
        return resetToStopped(session);
      case "WaitForReady":
      case "NoOp":
        return;
    }
  };

  const reconcileSession = async (sessionId: string): Promise<void> => {
    const session = await stateStore.getState(sessionId);
    if (!session) return;

    const action = computeRequiredAction(session.desiredState, session.currentState);
    await executeAction(session, action);
  };

  const handleDesiredStateChange = async (sessionId: string): Promise<void> => {
    await reconcileSession(sessionId);
  };

  const handleDaemonEvent = async (event: DaemonEvent): Promise<void> => {
    const { sessionId, type, data } = event;
    const session = await stateStore.getState(sessionId);
    if (!session) return;

    switch (type) {
      case "daemon:started":
        break;

      case "daemon:ready": {
        if (session.currentState !== "starting") return;

        const port = data?.port ?? session.streamPort;
        await updateCurrentState(sessionId, "running", { streamPort: port });

        if (session.lastUrl && session.lastUrl !== "about:blank") {
          await daemonController.navigate(sessionId, session.lastUrl);
        } else if (!session.lastUrl && config.getFirstExposedPort) {
          const exposedPort = await config.getFirstExposedPort(sessionId);
          if (exposedPort) {
            const url = `http://${sessionId}--${exposedPort}:${exposedPort}/`;
            await daemonController.navigate(sessionId, url);
          }
        }
        break;
      }

      case "daemon:stopped": {
        await updateCurrentState(sessionId, "stopped", {
          streamPort: null,
          retryCount: 0,
        });

        const updatedSession = await stateStore.getState(sessionId);
        if (updatedSession?.desiredState === "running") {
          await reconcileSession(sessionId);
        }
        break;
      }

      case "daemon:error": {
        await updateCurrentState(sessionId, "error", {
          errorMessage: data?.error ?? "Unknown daemon error",
        });
        break;
      }
    }
  };

  return { handleDesiredStateChange, handleDaemonEvent };
};
