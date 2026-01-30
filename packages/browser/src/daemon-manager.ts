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

const PROFILE_DIR = process.env.AGENT_BROWSER_PROFILE_DIR;

const activeSessions = new Map<string, { port: number; ready: boolean }>();
const daemonProcesses = new Map<string, Subprocess>();

const BASE_STREAM_PORT = parseInt(process.env.AGENT_BROWSER_STREAM_PORT ?? "9224", 10);
let nextStreamPort = BASE_STREAM_PORT + 1;

function initializeFromExistingDaemons(): void {
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
}

initializeFromExistingDaemons();

function allocatePort(): number {
  return nextStreamPort++;
}

export function isDaemonRunning(sessionId: string): boolean {
  return agentIsDaemonRunning(sessionId);
}

function killDaemonProcess(sessionId: string): boolean {
  const subprocess = daemonProcesses.get(sessionId);
  if (subprocess) {
    try {
      subprocess.kill("SIGTERM");
      daemonProcesses.delete(sessionId);
      cleanupSocket(sessionId);
      return true;
    } catch (error) {
      console.warn(`Failed to kill tracked daemon process for session ${sessionId}:`, error);
      daemonProcesses.delete(sessionId);
    }
  }

  try {
    const pidFile = getPidFile(sessionId);
    if (!existsSync(pidFile)) {
      return false;
    }

    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (isNaN(pid)) {
      return false;
    }

    process.kill(pid, "SIGTERM");
    cleanupSocket(sessionId);

    return true;
  } catch (error) {
    console.warn(`Failed to kill daemon process for session ${sessionId}:`, error);
    return false;
  }
}

export function getSessionPort(sessionId: string): number | undefined {
  return activeSessions.get(sessionId)?.port;
}

export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

export function isSessionReady(sessionId: string): boolean {
  return activeSessions.get(sessionId)?.ready ?? false;
}

export function getActiveSessions(): Array<{ sessionId: string; port: number; ready: boolean }> {
  return [...activeSessions.entries()].map(([sessionId, { port, ready }]) => ({
    sessionId,
    port,
    ready,
  }));
}

export async function startSessionDaemon(
  sessionId: string,
  options: { streamPort?: number } = {},
): Promise<{ status: "started" | "already_running"; port: number; ready: boolean }> {
  const existing = activeSessions.get(sessionId);
  if (existing) {
    return { status: "already_running", port: existing.port, ready: existing.ready };
  }

  const port = options.streamPort ?? allocatePort();

  if (port >= nextStreamPort) {
    nextStreamPort = port + 1;
  }

  activeSessions.set(sessionId, { port, ready: false });

  const daemonPath = require.resolve("agent-browser/dist/daemon.js");

  const env: Record<string, string> = {
    ...process.env,
    AGENT_BROWSER_DAEMON: "1",
    AGENT_BROWSER_SESSION: sessionId,
    AGENT_BROWSER_STREAM_PORT: String(port),
    AGENT_BROWSER_SOCKET_DIR: getSocketDir(),
  };

  if (PROFILE_DIR) {
    const profilePath = join(PROFILE_DIR, sessionId);
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
    console.log(`Daemon exited for session ${sessionId} with code ${exitCode}`);
    daemonProcesses.delete(sessionId);
    activeSessions.delete(sessionId);
  });

  const pollReady = async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (agentIsDaemonRunning(sessionId)) {
        const session = activeSessions.get(sessionId);
        if (session) {
          session.ready = true;
          console.log(`Daemon ready for session: ${sessionId} on port ${port}`);
        }
        return;
      }
    }
    console.error(`Daemon failed to become ready for session ${sessionId}`);
    activeSessions.delete(sessionId);
  };

  pollReady();

  console.log(`Starting daemon for session: ${sessionId} on port ${port}`);
  return { status: "started", port, ready: false };
}

export function stopSessionDaemon(sessionId: string): { status: "stopped" | "not_found" } {
  const wasTracked = activeSessions.has(sessionId);
  const killed = killDaemonProcess(sessionId);

  activeSessions.delete(sessionId);

  if (!wasTracked && !killed) {
    return { status: "not_found" };
  }

  console.log(`Stopped daemon for session: ${sessionId}`);
  return { status: "stopped" };
}
