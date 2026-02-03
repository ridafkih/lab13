import { cleanupSocket } from "agent-browser";
import type { DaemonManager, DaemonManagerConfig, DaemonSession, StartResult, StopResult } from "../types/daemon";
import type { DaemonEvent, DaemonEventHandler } from "../types/events";
import { spawnDaemon, killByPidFile, type DaemonWorkerHandle } from "./daemon-process";
import { recoverSession, discoverExistingSessions } from "./daemon-recovery";

export type { DaemonManager, DaemonManagerConfig, DaemonSession, StartResult, StopResult } from "../types/daemon";

interface SessionPorts {
  streamPort: number;
  cdpPort: number;
}

export function createDaemonManager(config: DaemonManagerConfig): DaemonManager {
  const activeSessions = new Map<string, SessionPorts>();
  const daemonWorkers = new Map<string, DaemonWorkerHandle>();
  const sessionUrls = new Map<string, string>();
  const eventHandlers = new Set<DaemonEventHandler>();

  let nextPort = config.baseStreamPort + 1;

  const allocatePorts = (): { streamPort: number; cdpPort: number } => {
    const cdpPort = nextPort++;
    const streamPort = nextPort++;
    return { streamPort, cdpPort };
  };

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
    onRecover: (sessionId: string, streamPort: number, cdpPort?: number) => {
      const resolvedCdpPort = cdpPort ?? nextPort++;
      activeSessions.set(sessionId, { streamPort, cdpPort: resolvedCdpPort });
      const maxRecoveredPort = Math.max(streamPort, resolvedCdpPort);
      if (maxRecoveredPort >= nextPort) {
        nextPort = maxRecoveredPort + 1;
      }
    },
  };

  const killDaemonWorker = (sessionId: string): boolean => {
    const handle = daemonWorkers.get(sessionId);
    if (handle) {
      handle.terminate();
      cleanupSocket(sessionId);
      daemonWorkers.delete(sessionId);
      return true;
    }
    return killByPidFile(sessionId);
  };

  discoverExistingSessions(recoveryCallbacks);

  return {
    async start(sessionId: string): Promise<StartResult> {
      const existing = activeSessions.get(sessionId);
      if (existing !== undefined) {
        return {
          type: "already_running",
          sessionId,
          port: existing.streamPort,
          cdpPort: existing.cdpPort,
          ready: true,
        };
      }

      const { streamPort, cdpPort } = allocatePorts();
      activeSessions.set(sessionId, { streamPort, cdpPort });

      const handle = spawnDaemon({ sessionId, streamPort, cdpPort, profileDir: config.profileDir });
      daemonWorkers.set(sessionId, handle);

      emit({ type: "daemon:started", sessionId, timestamp: Date.now(), data: { port: streamPort, cdpPort } });

      handle.onMessage((message) => {
        switch (message.type) {
          case "daemon:started":
            console.log(`[DaemonManager] Browser started: ${sessionId}`);
            break;

          case "daemon:ready":
            console.log(`[DaemonManager] Browser ready: ${sessionId}`);
            emit({ type: "daemon:ready", sessionId, timestamp: Date.now(), data: { port: streamPort, cdpPort } });
            break;

          case "daemon:error":
            console.error(`[DaemonManager] Browser error: ${sessionId}`, message.error);
            daemonWorkers.delete(sessionId);
            activeSessions.delete(sessionId);
            emit({ type: "daemon:error", sessionId, timestamp: Date.now(), data: { error: message.error } });
            break;

          case "browser:navigated": {
            const data = message.data;
            if (data && typeof data === "object" && "url" in data && typeof data.url === "string") {
              sessionUrls.set(sessionId, data.url);
            }
            break;
          }

        }
      });

      handle.onClose((code) => {
        console.log(`[DaemonManager] Worker closed: ${sessionId} (code ${code})`);
        daemonWorkers.delete(sessionId);
        activeSessions.delete(sessionId);
        sessionUrls.delete(sessionId);
        emit({ type: "daemon:stopped", sessionId, timestamp: Date.now(), data: { exitCode: code } });
      });

      return { type: "started", sessionId, port: streamPort, cdpPort, ready: false };
    },

    stop(sessionId: string): StopResult {
      const wasTracked = activeSessions.has(sessionId);
      const killed = killDaemonWorker(sessionId);
      activeSessions.delete(sessionId);
      sessionUrls.delete(sessionId);

      if (!wasTracked && !killed) {
        return { type: "not_found", sessionId };
      }

      return { type: "stopped", sessionId };
    },

    getSession(sessionId: string): DaemonSession | null {
      const ports = activeSessions.get(sessionId);
      if (ports === undefined) return null;
      return { sessionId, port: ports.streamPort, cdpPort: ports.cdpPort, ready: daemonWorkers.has(sessionId) };
    },

    getOrRecoverSession(sessionId: string): DaemonSession | null {
      return this.getSession(sessionId) ?? recoverSession(sessionId, recoveryCallbacks);
    },

    getAllSessions(): DaemonSession[] {
      return [...activeSessions.entries()].map(([sessionId, ports]) => ({
        sessionId,
        port: ports.streamPort,
        cdpPort: ports.cdpPort,
        ready: daemonWorkers.has(sessionId),
      }));
    },

    isRunning(sessionId: string): boolean {
      return activeSessions.has(sessionId);
    },

    isReady(sessionId: string): boolean {
      return activeSessions.has(sessionId) && daemonWorkers.has(sessionId);
    },

    navigate(sessionId: string, url: string): boolean {
      const handle = daemonWorkers.get(sessionId);
      if (!handle) return false;
      handle.navigate(url);
      return true;
    },

    getCurrentUrl(sessionId: string): string | null {
      return sessionUrls.get(sessionId) ?? null;
    },

    onEvent(handler: DaemonEventHandler): () => void {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };
}
