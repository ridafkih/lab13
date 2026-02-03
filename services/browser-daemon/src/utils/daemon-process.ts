import { cleanupSocket, getSocketDir, getPidFile } from "agent-browser";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface SpawnOptions {
  sessionId: string;
  streamPort: number;
  cdpPort: number;
  profileDir?: string;
}

export type WorkerMessageHandler = (message: WorkerMessage) => void;
export type WorkerCloseHandler = (code: number) => void;

export interface WorkerMessage {
  type: string;
  data?: unknown;
  error?: string;
}

export interface DaemonWorkerHandle {
  worker: Worker;
  sessionId: string;
  navigate: (url: string) => void;
  terminate: () => void;
  onMessage: (handler: WorkerMessageHandler) => void;
  onClose: (handler: WorkerCloseHandler) => void;
}

export interface DaemonWorkerConfig {
  sessionId: string;
  streamPort: number;
  cdpPort: number;
  socketDir: string;
  profilePath?: string;
}

function buildWorkerConfig(
  sessionId: string,
  port: number,
  cdpPort: number,
  profileDir?: string,
): DaemonWorkerConfig {
  const config: DaemonWorkerConfig = {
    sessionId,
    streamPort: port,
    cdpPort,
    socketDir: getSocketDir(),
  };

  if (profileDir) {
    const profilePath = join(profileDir, sessionId);
    if (!existsSync(profilePath)) {
      mkdirSync(profilePath, { recursive: true });
    }
    config.profilePath = profilePath;
  }

  return config;
}

export function spawnDaemon(options: SpawnOptions): DaemonWorkerHandle {
  const { sessionId, streamPort, cdpPort, profileDir } = options;
  const config = buildWorkerConfig(sessionId, streamPort, cdpPort, profileDir);

  const workerPath = new URL("./daemon-worker.ts", import.meta.url).href;
  const worker = new Worker(workerPath);

  const messageHandlers = new Set<WorkerMessageHandler>();
  const closeHandlers = new Set<WorkerCloseHandler>();

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    if (event.data.type === "ready") {
      worker.postMessage({ type: "init", data: config });
      return;
    }

    for (const handler of messageHandlers) {
      try {
        handler(event.data);
      } catch (error) {
        console.error(`[DaemonProcess] Message handler error:`, error);
      }
    }
  };

  worker.onerror = (error) => {
    console.error(`[DaemonProcess] Worker error for ${sessionId}:`, error);
  };

  worker.addEventListener("close", (event: Event) => {
    const code = "code" in event && typeof event.code === "number" ? event.code : 0;
    for (const handler of closeHandlers) {
      try {
        handler(code);
      } catch (error) {
        console.error(`[DaemonProcess] Close handler error:`, error);
      }
    }
  });

  return {
    worker,
    sessionId,
    navigate: (url) => {
      worker.postMessage({ type: "navigate", data: { url } });
    },
    terminate: () => {
      worker.terminate();
    },
    onMessage: (handler) => {
      messageHandlers.add(handler);
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
    },
  };
}

export function killByPidFile(sessionId: string): boolean {
  try {
    const pidFile = getPidFile(sessionId);
    if (!existsSync(pidFile)) return false;

    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (isNaN(pid)) return false;

    process.kill(pid, "SIGTERM");
    cleanupSocket(sessionId);
    return true;
  } catch (error) {
    console.warn(`[DaemonProcess] Failed to kill process for ${sessionId}:`, error);
    return false;
  }
}
