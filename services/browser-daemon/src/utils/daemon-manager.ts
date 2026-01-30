import { isDaemonRunning } from "agent-browser";
import type { Subprocess } from "bun";
import type { DaemonManager, DaemonManagerConfig, DaemonSession, StartResult, StopResult } from "../types/daemon";
import type { DaemonEvent, DaemonEventHandler } from "../types/events";
import { spawnDaemon, killSubprocess, killByPidFile } from "./daemon-process";
import { recoverSession, discoverExistingSessions } from "./daemon-recovery";

export type { DaemonManager, DaemonManagerConfig, DaemonSession, StartResult, StopResult } from "../types/daemon";

export function createDaemonManager(config: DaemonManagerConfig): DaemonManager {
  const activeSessions = new Map<string, number>();
  const daemonProcesses = new Map<string, Subprocess>();
  const eventHandlers = new Set<DaemonEventHandler>();
  let nextStreamPort = config.baseStreamPort + 1;

  const allocatePort = (): number => nextStreamPort++;

  const emit = (event: DaemonEvent): void => {
    for (const handler of eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("[DaemonManager] Event handler error:", error);
      }
    }
  };

  const recoveryCallbacks = {
    onRecover: (sessionId: string, port: number) => {
      activeSessions.set(sessionId, port);
      if (port >= nextStreamPort) {
        nextStreamPort = port + 1;
      }
    },
  };

  const killDaemonProcess = (sessionId: string): boolean => {
    const subprocess = daemonProcesses.get(sessionId);
    if (subprocess) {
      const killed = killSubprocess(subprocess, sessionId);
      daemonProcesses.delete(sessionId);
      if (killed) return true;
    }
    return killByPidFile(sessionId);
  };

  discoverExistingSessions(recoveryCallbacks);

  return {
    async start(sessionId: string): Promise<StartResult> {
      const existingPort = activeSessions.get(sessionId);
      if (existingPort !== undefined) {
        return { type: "already_running", sessionId, port: existingPort, ready: isDaemonRunning(sessionId) };
      }

      const port = allocatePort();
      activeSessions.set(sessionId, port);

      const subprocess = spawnDaemon({ sessionId, port, profileDir: config.profileDir });
      daemonProcesses.set(sessionId, subprocess);

      emit({ type: "daemon:started", sessionId, timestamp: Date.now(), data: { port } });

      subprocess.exited.then((exitCode) => {
        console.log(`[DaemonManager] Exited: ${sessionId} (code ${exitCode})`);
        daemonProcesses.delete(sessionId);
        activeSessions.delete(sessionId);
        emit({ type: "daemon:stopped", sessionId, timestamp: Date.now(), data: { exitCode: exitCode ?? undefined } });
      });

      const pollForReady = async () => {
        const maxAttempts = 30;
        const pollInterval = 100;
        for (let i = 0; i < maxAttempts; i++) {
          if (isDaemonRunning(sessionId)) {
            emit({ type: "daemon:ready", sessionId, timestamp: Date.now(), data: { port } });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
        emit({ type: "daemon:error", sessionId, timestamp: Date.now(), data: { error: "Timeout waiting for daemon ready" } });
      };
      pollForReady();

      console.log(`[DaemonManager] Starting: ${sessionId} on port ${port}`);
      return { type: "started", sessionId, port, ready: false };
    },

    stop(sessionId: string): StopResult {
      const wasTracked = activeSessions.has(sessionId);
      const killed = killDaemonProcess(sessionId);
      activeSessions.delete(sessionId);

      if (!wasTracked && !killed) {
        return { type: "not_found", sessionId };
      }

      console.log(`[DaemonManager] Stopped: ${sessionId}`);
      return { type: "stopped", sessionId };
    },

    getSession(sessionId: string): DaemonSession | null {
      const port = activeSessions.get(sessionId);
      if (port === undefined) return null;
      return { sessionId, port, ready: isDaemonRunning(sessionId) };
    },

    getOrRecoverSession(sessionId: string): DaemonSession | null {
      return this.getSession(sessionId) ?? recoverSession(sessionId, recoveryCallbacks);
    },

    getAllSessions(): DaemonSession[] {
      return [...activeSessions.entries()].map(([sessionId, port]) => ({
        sessionId,
        port,
        ready: isDaemonRunning(sessionId),
      }));
    },

    isRunning(sessionId: string): boolean {
      return activeSessions.has(sessionId) && isDaemonRunning(sessionId);
    },

    isReady(sessionId: string): boolean {
      return activeSessions.has(sessionId) && isDaemonRunning(sessionId);
    },

    onEvent(handler: DaemonEventHandler): () => void {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };
}
