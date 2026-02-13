import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupSocket, getPidFile, getSocketDir } from "agent-browser";
import type { Command, Response } from "agent-browser/dist/types.js";
import { TIMING } from "../config/constants";
import { widelog } from "../logging";
import { getErrorMessage } from "../shared/errors";

interface SpawnOptions {
  sessionId: string;
  streamPort: number;
  cdpPort: number;
  profileDir?: string;
}

type WorkerMessageHandler = (message: WorkerMessage) => void;
type WorkerCloseHandler = (code: number) => void;

interface WorkerMessage {
  type: string;
  data?: unknown;
  error?: string;
}

interface CommandResponsePayload {
  requestId: string;
  response: Response;
}

export interface DaemonWorkerHandle {
  worker: Worker;
  sessionId: string;
  navigate: (url: string) => void;
  executeCommand: (command: Command) => Promise<Response>;
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
  profileDir?: string
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

function toLogPayload(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    return {};
  }
  return Object.fromEntries(Object.entries(data));
}

function logWorkerMessage(data: unknown): void {
  const logPayload = toLogPayload(data);
  const { level, ...logData } = logPayload;
  widelog.context(() => {
    for (const [key, value] of Object.entries(logData)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        widelog.set(key, value);
      }
    }
    if (level === "error") {
      widelog.set("outcome", "error");
    }
    widelog.flush();
  });
}

function resolveCommandResponse(
  data: unknown,
  pendingCommands: Map<
    string,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >
): void {
  if (!isCommandResponsePayload(data)) {
    return;
  }

  const pending = pendingCommands.get(data.requestId);
  if (!pending) {
    return;
  }

  pendingCommands.delete(data.requestId);
  pending.resolve(data.response);
}

function isCommandResponsePayload(
  value: unknown
): value is CommandResponsePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "requestId" in value &&
    typeof value.requestId === "string" &&
    "response" in value
  );
}

function notifyHandlers(
  handlers: Iterable<WorkerMessageHandler>,
  message: WorkerMessage
): void {
  for (const handler of handlers) {
    try {
      handler(message);
    } catch (error) {
      widelog.context(() => {
        widelog.set("event_name", "daemon.message_handler_error");
        widelog.set("outcome", "error");
        widelog.set("error_message", getErrorMessage(error));
        widelog.flush();
      });
    }
  }
}

export function spawnDaemon(options: SpawnOptions): DaemonWorkerHandle {
  const { sessionId, streamPort, cdpPort, profileDir } = options;
  const config = buildWorkerConfig(sessionId, streamPort, cdpPort, profileDir);

  const workerPath = new URL("./daemon-worker.ts", import.meta.url).href;
  const worker = new Worker(workerPath);

  const messageHandlers = new Set<WorkerMessageHandler>();
  const closeHandlers = new Set<WorkerCloseHandler>();
  const pendingCommands = new Map<
    string,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >();

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    if (event.data.type === "ready") {
      worker.postMessage({ type: "init", data: config });
      return;
    }

    if (event.data.type === "log") {
      logWorkerMessage(event.data.data);
      return;
    }

    if (event.data.type === "commandResponse") {
      resolveCommandResponse(event.data.data, pendingCommands);
      return;
    }

    notifyHandlers(messageHandlers, event.data);
  };

  worker.onerror = (error) => {
    widelog.context(() => {
      widelog.set("event_name", "daemon.worker_error");
      widelog.set("session_id", sessionId);
      widelog.set("stream_port", config.streamPort);
      widelog.set("cdp_port", config.cdpPort);
      widelog.set("pending_commands", pendingCommands.size);
      widelog.set("outcome", "error");
      widelog.set("error_message", getErrorMessage(error));
      widelog.flush();
    });
  };

  worker.addEventListener("close", (event: Event) => {
    const code =
      "code" in event && typeof event.code === "number" ? event.code : 0;
    for (const handler of closeHandlers) {
      try {
        handler(code);
      } catch {
        // Close handler errors are non-critical
      }
    }
  });

  return {
    worker,
    sessionId,
    navigate: (url) => {
      worker.postMessage({ type: "navigate", data: { url } });
    },
    executeCommand: (command: Command): Promise<Response> => {
      return new Promise((resolve, reject) => {
        const requestId = `${command.id}-${Date.now()}`;
        pendingCommands.set(requestId, { resolve, reject });
        worker.postMessage({
          type: "executeCommand",
          data: { requestId, command },
        });

        setTimeout(() => {
          if (pendingCommands.has(requestId)) {
            pendingCommands.delete(requestId);
            reject(new Error(`Command timeout: ${command.action}`));
          }
        }, TIMING.COMMAND_TIMEOUT_MS);
      });
    },
    terminate: () => {
      for (const pending of pendingCommands.values()) {
        pending.reject(new Error("Worker terminated"));
      }
      pendingCommands.clear();
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
  return widelog.context(() => {
    widelog.set("event_name", "daemon.kill_by_pid_file");
    widelog.set("session_id", sessionId);

    try {
      const pidFile = getPidFile(sessionId);
      if (!existsSync(pidFile)) {
        widelog.set("outcome", "not_found");
        return false;
      }

      const pid = Number.parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      widelog.set("pid", pid);

      if (Number.isNaN(pid)) {
        widelog.set("outcome", "invalid_pid");
        return false;
      }

      if (pid === process.pid || pid === process.ppid) {
        widelog.set("outcome", "refused_self_kill");
        cleanupSocket(sessionId);
        return false;
      }

      try {
        process.kill(pid, 0);
      } catch {
        widelog.set("outcome", "process_not_running");
        cleanupSocket(sessionId);
        return false;
      }

      process.kill(pid, "SIGTERM");
      cleanupSocket(sessionId);
      widelog.set("outcome", "success");
      return true;
    } catch (error) {
      widelog.set("outcome", "error");
      widelog.set("error_message", getErrorMessage(error));
      return false;
    } finally {
      widelog.flush();
    }
  });
}
