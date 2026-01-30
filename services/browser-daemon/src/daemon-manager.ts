import {
  isDaemonRunning as agentIsDaemonRunning,
  getPidFile,
  cleanupSocket,
  getSocketDir,
  getStreamPortFile,
} from "agent-browser";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";

export interface DaemonSession {
  sessionId: string;
  port: number;
  ready: boolean;
}

export interface StartResult {
  type: "started" | "already_running";
  sessionId: string;
  port: number;
  ready: boolean;
}

export interface StopResult {
  type: "stopped" | "not_found";
  sessionId: string;
}

export interface DaemonManagerConfig {
  baseStreamPort: number;
  profileDir?: string;
}

export interface DaemonManager {
  start(sessionId: string): Promise<StartResult>;
  stop(sessionId: string): StopResult;
  getSession(sessionId: string): DaemonSession | null;
  getAllSessions(): DaemonSession[];
  isRunning(sessionId: string): boolean;
  isReady(sessionId: string): boolean;
}

export function createDaemonManager(config: DaemonManagerConfig): DaemonManager {
  const activeSessions = new Map<string, { port: number; ready: boolean }>();
  const daemonProcesses = new Map<string, Subprocess>();
  let nextStreamPort = config.baseStreamPort + 1;

  const initializeFromExistingDaemons = (): void => {
    const socketDir = getSocketDir();
    if (!existsSync(socketDir)) return;

    const files = readdirSync(socketDir);
    const streamFiles = files.filter((f) => f.endsWith(".stream"));

    for (const streamFile of streamFiles) {
      const sessionId = streamFile.replace(".stream", "");
      if (sessionId === "default") continue;

      try {
        const streamPortPath = getStreamPortFile(sessionId);
        if (!existsSync(streamPortPath)) continue;

        const port = parseInt(readFileSync(streamPortPath, "utf-8").trim(), 10);
        if (isNaN(port)) continue;

        if (agentIsDaemonRunning(sessionId)) {
          activeSessions.set(sessionId, { port, ready: true });
          if (port >= nextStreamPort) {
            nextStreamPort = port + 1;
          }
        } else {
          cleanupSocket(sessionId);
        }
      } catch {
        // Ignore errors reading files
      }
    }
  };

  const allocatePort = (): number => nextStreamPort++;

  const killDaemonProcess = (sessionId: string): boolean => {
    const subprocess = daemonProcesses.get(sessionId);
    if (subprocess) {
      try {
        subprocess.kill("SIGTERM");
        daemonProcesses.delete(sessionId);
        cleanupSocket(sessionId);
        return true;
      } catch (error) {
        console.warn(`[DaemonManager] Failed to kill subprocess for ${sessionId}:`, error);
        daemonProcesses.delete(sessionId);
      }
    }

    try {
      const pidFile = getPidFile(sessionId);
      if (!existsSync(pidFile)) return false;

      const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      if (isNaN(pid)) return false;

      process.kill(pid, "SIGTERM");
      cleanupSocket(sessionId);
      return true;
    } catch (error) {
      console.warn(`[DaemonManager] Failed to kill process for ${sessionId}:`, error);
      return false;
    }
  };

  const pollUntilReady = async (sessionId: string, port: number): Promise<void> => {
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (agentIsDaemonRunning(sessionId)) {
        const session = activeSessions.get(sessionId);
        if (session) {
          session.ready = true;
          console.log(`[DaemonManager] Ready: ${sessionId} on port ${port}`);
        }
        return;
      }
    }
    console.error(`[DaemonManager] Timeout waiting for ${sessionId} to become ready`);
    activeSessions.delete(sessionId);
  };

  // Initialize on creation
  initializeFromExistingDaemons();

  return {
    async start(sessionId: string): Promise<StartResult> {
      const existing = activeSessions.get(sessionId);
      if (existing) {
        return { type: "already_running", sessionId, port: existing.port, ready: existing.ready };
      }

      const port = allocatePort();
      activeSessions.set(sessionId, { port, ready: false });

      const daemonPath = require.resolve("agent-browser/dist/daemon.js");

      const env: Record<string, string> = {
        ...process.env,
        AGENT_BROWSER_DAEMON: "1",
        AGENT_BROWSER_SESSION: sessionId,
        AGENT_BROWSER_STREAM_PORT: String(port),
        AGENT_BROWSER_SOCKET_DIR: getSocketDir(),
      } as Record<string, string>;

      if (config.profileDir) {
        const profilePath = join(config.profileDir, sessionId);
        if (!existsSync(profilePath)) {
          mkdirSync(profilePath, { recursive: true });
        }
        env.AGENT_BROWSER_PROFILE = profilePath;
      }

      const subprocess = Bun.spawn(["bun", "run", daemonPath], {
        env,
        stdio: ["ignore", "inherit", "inherit"],
      });

      daemonProcesses.set(sessionId, subprocess);

      subprocess.exited.then((exitCode) => {
        console.log(`[DaemonManager] Exited: ${sessionId} (code ${exitCode})`);
        daemonProcesses.delete(sessionId);
        activeSessions.delete(sessionId);
      });

      pollUntilReady(sessionId, port);

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
      const session = activeSessions.get(sessionId);
      if (!session) return null;
      return { sessionId, port: session.port, ready: session.ready };
    },

    getAllSessions(): DaemonSession[] {
      return [...activeSessions.entries()].map(([sessionId, { port, ready }]) => ({
        sessionId,
        port,
        ready,
      }));
    },

    isRunning(sessionId: string): boolean {
      return activeSessions.has(sessionId) && agentIsDaemonRunning(sessionId);
    },

    isReady(sessionId: string): boolean {
      return activeSessions.get(sessionId)?.ready ?? false;
    },
  };
}
