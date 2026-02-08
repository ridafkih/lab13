import * as net from "node:net";
import * as fs from "node:fs";
import { BrowserManager } from "agent-browser/dist/browser.js";
import { StreamServer } from "agent-browser/dist/stream-server.js";
import { executeCommand } from "agent-browser/dist/actions.js";
import { parseCommand, serializeResponse, errorResponse } from "agent-browser/dist/protocol.js";
import type { DaemonWorkerConfig } from "./daemon-process";

declare var self: Worker;

function isDaemonWorkerConfig(value: unknown): value is DaemonWorkerConfig {
  if (typeof value !== "object" || value === null) return false;
  if (!("sessionId" in value) || typeof value.sessionId !== "string") return false;
  if (!("streamPort" in value) || typeof value.streamPort !== "number") return false;
  if (!("cdpPort" in value) || typeof value.cdpPort !== "number") return false;
  if (!("socketDir" in value) || typeof value.socketDir !== "string") return false;
  return true;
}

const state: {
  browser: BrowserManager | null;
  streamServer: StreamServer | null;
  socketServer: net.Server | null;
} = { browser: null, streamServer: null, socketServer: null };

type BrowserPage = ReturnType<BrowserManager["getPage"]>;

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
    postMessage({ type: "browser:console", data: { level: msg.type(), text: msg.text() } });
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
      data: { level: "info", event_name: "daemon_worker.request", session_id: sessionId },
    });
    postMessage({
      type: "browser:request",
      data: { method: request.method(), url: request.url() },
    });
  });

  page.on("response", (response) => {
    self.postMessage({
      type: "log",
      data: { level: "info", event_name: "daemon_worker.response", session_id: sessionId },
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
      data: { level: "info", event_name: "daemon_worker.page_loaded", session_id: sessionId },
    });
    postMessage({ type: "browser:loaded" });
  });

  page.on("close", () => {
    self.postMessage({
      type: "log",
      data: { level: "info", event_name: "daemon_worker.page_closed", session_id: sessionId },
    });
    postMessage({ type: "browser:closed" });
  });
};

const setupBrowserEvents = (sessionId: string, browser: BrowserManager) => {
  const trackedPages = new Set<BrowserPage>();

  const trackPage = (page: BrowserPage) => {
    if (trackedPages.has(page)) return;
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

const createSocketServer = (
  sessionId: string,
  socketPath: string,
  browser: BrowserManager,
): net.Server => {
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parseResult = parseCommand(line);

          if (!parseResult.success) {
            socket.write(
              serializeResponse(errorResponse(parseResult.id ?? "unknown", parseResult.error)) +
                "\n",
            );
            continue;
          }

          const response = await executeCommand(parseResult.command, browser);
          socket.write(serializeResponse(response) + "\n");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          socket.write(serializeResponse(errorResponse("error", message)) + "\n");
        }
      }
    });

    socket.on("error", () => {});
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

  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }

  fs.writeFileSync(pidFile, process.pid.toString());
  fs.writeFileSync(streamPortFile, streamPort.toString());
  fs.writeFileSync(cdpPortFile, cdpPort.toString());

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
      data: { level: "info", event_name: "daemon_worker.browser_launched", session_id: sessionId },
    });
    setupBrowserEvents(sessionId, state.browser);

    state.socketServer = createSocketServer(sessionId, socketPath, state.browser);

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

  self.onmessage = async (event: MessageEvent) => {
    const { type, data } = event.data;

    switch (type) {
      case "navigate":
        if (state.browser) {
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
        }
        break;

      case "executeCommand": {
        const { requestId, command } = data;
        if (!state.browser) {
          postMessage({
            type: "commandResponse",
            data: {
              requestId,
              response: { id: command.id, success: false, error: "Browser not initialized" },
            },
          });
          break;
        }
        try {
          const response = await executeCommand(command, state.browser);
          postMessage({ type: "commandResponse", data: { requestId, response } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          postMessage({
            type: "commandResponse",
            data: { requestId, response: { id: command.id, success: false, error: message } },
          });
        }
        break;
      }

      case "terminate":
        self.postMessage({
          type: "log",
          data: { level: "info", event_name: "daemon_worker.terminating", session_id: sessionId },
        });
        state.socketServer?.close();
        state.streamServer?.stop();
        state.browser?.close();
        try {
          if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
          if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
          if (fs.existsSync(streamPortFile)) fs.unlinkSync(streamPortFile);
          if (fs.existsSync(cdpPortFile)) fs.unlinkSync(cdpPortFile);
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
