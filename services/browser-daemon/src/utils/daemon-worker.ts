import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { executeCommand } from "agent-browser/dist/actions.js";
import { BrowserManager } from "agent-browser/dist/browser.js";
import {
  errorResponse,
  parseCommand,
  serializeResponse,
} from "agent-browser/dist/protocol.js";
import { StreamServer } from "agent-browser/dist/stream-server.js";
import type { DaemonWorkerConfig } from "./daemon-process";

declare let self: Worker;

const isPidRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (reason) {
    return (
      reason instanceof Error && "code" in reason && reason.code === "EPERM"
    );
  }
};

function isDaemonWorkerConfig(value: unknown): value is DaemonWorkerConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string") {
    return false;
  }
  if (!("streamPort" in value) || typeof value.streamPort !== "number") {
    return false;
  }
  if (!("cdpPort" in value) || typeof value.cdpPort !== "number") {
    return false;
  }
  if (!("socketDir" in value) || typeof value.socketDir !== "string") {
    return false;
  }
  return true;
}

const state: {
  browser: BrowserManager | null;
  streamServer: StreamServer | null;
  socketServer: Server | null;
} = { browser: null, streamServer: null, socketServer: null };

type BrowserPage = ReturnType<BrowserManager["getPage"]>;
type BrowserCommand = Parameters<typeof executeCommand>[0];

const setupPageEvents = (sessionId: string, page: BrowserPage) => {
  page.on("console", (msg) => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.console_message",
        session_id: sessionId,
        msg_type: msg.type(),
      },
    });
    postMessage({
      type: "browser:console",
      data: { level: msg.type(), text: msg.text() },
    });
  });

  page.on("pageerror", (error) => {
    self.postMessage({
      type: "log",
      data: {
        level: "error",
        event_name: "daemon_worker.page_error",
        session_id: sessionId,
        error: error.message,
      },
    });
    postMessage({ type: "browser:error", data: { message: error.message } });
  });

  page.on("request", (request) => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.request",
        session_id: sessionId,
      },
    });
    postMessage({
      type: "browser:request",
      data: { method: request.method(), url: request.url() },
    });
  });

  page.on("response", (response) => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.response",
        session_id: sessionId,
      },
    });
    postMessage({
      type: "browser:response",
      data: { status: response.status(), url: response.url() },
    });
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      self.postMessage({
        type: "log",
        data: {
          level: "info",
          event_name: "daemon_worker.navigated",
          session_id: sessionId,
          url: frame.url(),
        },
      });
      postMessage({ type: "browser:navigated", data: { url: frame.url() } });
    }
  });

  page.on("load", () => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.page_loaded",
        session_id: sessionId,
      },
    });
    postMessage({ type: "browser:loaded" });
  });

  page.on("close", () => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.page_closed",
        session_id: sessionId,
      },
    });
    postMessage({ type: "browser:closed" });
  });
};

const setupBrowserEvents = (sessionId: string, browser: BrowserManager) => {
  const trackedPages = new Set<BrowserPage>();

  const trackPage = (page: BrowserPage) => {
    if (trackedPages.has(page)) {
      return;
    }
    trackedPages.add(page);
    setupPageEvents(sessionId, page);
  };

  trackPage(browser.getPage());

  const playwrightBrowser = browser.getBrowser();
  if (playwrightBrowser) {
    for (const context of playwrightBrowser.contexts()) {
      context.on("page", async (newPage) => {
        self.postMessage({
          type: "log",
          data: {
            level: "info",
            event_name: "daemon_worker.new_page_opened",
            session_id: sessionId,
          },
        });
        trackPage(newPage);

        const pages = browser.getPages();
        const newIndex = pages.indexOf(newPage);
        if (newIndex !== -1 && newIndex !== browser.getActiveIndex()) {
          self.postMessage({
            type: "log",
            data: {
              level: "info",
              event_name: "daemon_worker.tab_switched",
              session_id: sessionId,
              tab_index: newIndex,
            },
          });
          await browser.switchTo(newIndex);
          postMessage({
            type: "browser:tab_switched",
            data: { index: newIndex, url: newPage.url() },
          });
        }
      });
    }
  }
};

const processSocketLine = async (
  line: string,
  browser: BrowserManager,
  socket: { write: (data: string) => void }
): Promise<void> => {
  if (!line.trim()) {
    return;
  }

  try {
    const parseResult = parseCommand(line);

    if (!parseResult.success) {
      socket.write(
        `${serializeResponse(
          errorResponse(parseResult.id ?? "unknown", parseResult.error)
        )}\n`
      );
      return;
    }

    const response = await executeCommand(parseResult.command, browser);
    socket.write(`${serializeResponse(response)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    socket.write(`${serializeResponse(errorResponse("error", message))}\n`);
  }
};

const createSocketServer = (
  sessionId: string,
  socketPath: string,
  browser: BrowserManager
): Server => {
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }

  const server = createServer((socket) => {
    let buffer = "";

    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        await processSocketLine(line, browser, socket);
      }
    });

    socket.on("error", () => {
      /* expected */
    });
  });

  server
    .listen(socketPath, () => {
      self.postMessage({
        type: "log",
        data: {
          level: "info",
          event_name: "daemon_worker.socket_listening",
          session_id: sessionId,
          socket_path: socketPath,
        },
      });
    })
    .on("error", (err) => {
      self.postMessage({
        type: "log",
        data: {
          level: "error",
          event_name: "daemon_worker.socket_error",
          session_id: sessionId,
          error: err.message,
        },
      });
    });

  return server;
};

const startWorker = async (config: DaemonWorkerConfig) => {
  const { sessionId, streamPort, cdpPort, socketDir, profilePath } = config;
  const socketPath = `${socketDir}/${sessionId}.sock`;
  const pidFile = `${socketDir}/${sessionId}.pid`;
  const streamPortFile = `${socketDir}/${sessionId}.stream`;
  const cdpPortFile = `${socketDir}/${sessionId}.cdp`;

  self.postMessage({
    type: "log",
    data: {
      level: "info",
      event_name: "daemon_worker.starting",
      session_id: sessionId,
      stream_port: streamPort,
      cdp_port: cdpPort,
    },
  });

  if (!existsSync(socketDir)) {
    mkdirSync(socketDir, { recursive: true });
  }

  writeFileSync(pidFile, process.pid.toString());
  writeFileSync(streamPortFile, streamPort.toString());
  writeFileSync(cdpPortFile, cdpPort.toString());

  try {
    state.browser = new BrowserManager();

    await state.browser.launch({
      id: sessionId,
      action: "launch",
      headless: true,
      profile: profilePath,
      args: [`--remote-debugging-port=${cdpPort}`],
    });

    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.browser_launched",
        session_id: sessionId,
      },
    });
    setupBrowserEvents(sessionId, state.browser);

    state.socketServer = createSocketServer(
      sessionId,
      socketPath,
      state.browser
    );

    state.streamServer = new StreamServer(state.browser, streamPort);
    await state.streamServer.start();

    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.stream_started",
        session_id: sessionId,
        stream_port: streamPort,
      },
    });
    postMessage({ type: "daemon:started" });
    postMessage({ type: "daemon:ready", data: { port: streamPort } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: "log",
      data: {
        level: "error",
        event_name: "daemon_worker.start_failed",
        session_id: sessionId,
        error: message,
      },
    });
    postMessage({ type: "daemon:error", error: message });
    process.exit(1);
  }

  const handleNavigate = (data: { url: string }) => {
    if (!state.browser) {
      return;
    }
    state.browser
      .getPage()
      .goto(data.url)
      .catch((err: Error) => {
        self.postMessage({
          type: "log",
          data: {
            level: "error",
            event_name: "daemon_worker.navigation_error",
            session_id: sessionId,
            error: err.message,
          },
        });
      });
  };

  const handleExecuteCommand = async (data: {
    requestId: string;
    command: BrowserCommand;
  }) => {
    const { requestId, command } = data;
    if (!state.browser) {
      postMessage({
        type: "commandResponse",
        data: {
          requestId,
          response: {
            id: command.id,
            success: false,
            error: "Browser not initialized",
          },
        },
      });
      return;
    }
    try {
      const response = await executeCommand(command, state.browser);
      postMessage({
        type: "commandResponse",
        data: { requestId, response },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postMessage({
        type: "commandResponse",
        data: {
          requestId,
          response: { id: command.id, success: false, error: message },
        },
      });
    }
  };

  const handleTerminate = () => {
    self.postMessage({
      type: "log",
      data: {
        level: "info",
        event_name: "daemon_worker.terminating",
        session_id: sessionId,
      },
    });

    state.socketServer?.close();
    state.streamServer?.stop();

    const browser = state.browser?.getBrowser();
    if (
      browser &&
      "process" in browser &&
      typeof browser.process === "function"
    ) {
      const browserPid = browser.process()?.pid;
      if (browserPid && isPidRunning(browserPid)) {
        process.kill(browserPid, "SIGKILL");
      }
    }

    const filesToClean = [socketPath, pidFile, streamPortFile, cdpPortFile];
    try {
      for (const file of filesToClean) {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      }
    } catch (error) {
      self.postMessage({
        type: "log",
        data: {
          level: "error",
          event_name: "daemon_worker.termination_error",
          session_id: sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    process.exit(0);
  };

  self.onmessage = async (event: MessageEvent) => {
    const { type, data } = event.data;

    switch (type) {
      case "navigate":
        handleNavigate(data);
        break;
      case "executeCommand":
        await handleExecuteCommand(data);
        break;
      case "terminate":
        handleTerminate();
        break;
      default:
        break;
    }
  };
};

self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;

  if (type === "init" && isDaemonWorkerConfig(data)) {
    startWorker(data);
  }
};

postMessage({ type: "ready" });
