import { type AppSchema, schema } from "@lab/multiplayer-sdk";
import {
  createWebSocketHandler,
  type HandlerOptions,
  type SchemaHandlers,
} from "@lab/multiplayer-server";
import type { BrowserService } from "../browser/browser-service";
import { widelog } from "../logging";
import type { LogMonitor } from "../monitors/log.monitor";
import { ValidationError } from "../shared/errors";
import {
  loadProjects,
  loadSessionChangedFiles,
  loadSessionContainers,
  loadSessionLogs,
  loadSessionMetadata,
  loadSessions,
  loadSessionTasks,
} from "../snapshots/snapshot-loaders";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import { MESSAGE_ROLE } from "../types/message";
import type { Auth } from "../types/websocket";

export type { Auth } from "../types/websocket";

interface WebSocketHandlerDeps {
  browserService: BrowserService;
  publisher: Publisher;
  logMonitor: LogMonitor;
  proxyBaseUrl: string;
  sessionStateStore: SessionStateStore;
}

export function createWebSocketHandlers(deps: WebSocketHandlerDeps) {
  const {
    browserService,
    publisher,
    logMonitor,
    proxyBaseUrl,
    sessionStateStore,
  } = deps;
  const sessionSubscribers = new Map<string, Set<object>>();

  const handlers: SchemaHandlers<AppSchema, Auth> = {
    projects: {
      getSnapshot: loadProjects,
    },
    sessions: {
      getSnapshot: loadSessions,
    },
    sessionMetadata: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          throw new ValidationError("Missing uuid parameter");
        }
        return loadSessionMetadata(params.uuid, sessionStateStore);
      },
    },
    sessionContainers: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          throw new ValidationError("Missing uuid parameter");
        }
        return loadSessionContainers(params.uuid, proxyBaseUrl);
      },
    },
    sessionTyping: {
      getSnapshot: () => Promise.resolve([]),
    },
    sessionPromptEngineers: {
      getSnapshot: () => Promise.resolve([]),
    },
    sessionChangedFiles: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          throw new ValidationError("Missing uuid parameter");
        }
        return loadSessionChangedFiles();
      },
    },
    sessionTasks: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          throw new ValidationError("Missing uuid parameter");
        }
        return loadSessionTasks(params.uuid);
      },
    },
    sessionBranches: {
      getSnapshot: () => Promise.resolve([]),
    },
    sessionLinks: {
      getSnapshot: () => Promise.resolve([]),
    },
    sessionLogs: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          return Promise.resolve({ sources: [], recentLogs: {} });
        }
        return loadSessionLogs(params.uuid, logMonitor);
      },
    },
    sessionMessages: {
      getSnapshot: () => Promise.resolve([]),
    },
    sessionBrowserState: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          throw new ValidationError("Missing uuid parameter");
        }
        return browserService.getBrowserSnapshot(params.uuid);
      },
      onSubscribe: ({ params, ws }) => {
        widelog.context(async () => {
          const sessionId = params.uuid;
          widelog.set("event_name", "websocket.browser_subscribe");
          widelog.set("session_id", sessionId ?? "unknown");

          if (!sessionId) {
            widelog.set("outcome", "skipped");
            widelog.flush();
            return;
          }

          if (!sessionSubscribers.has(sessionId)) {
            sessionSubscribers.set(sessionId, new Set());
          }
          const subscribers = sessionSubscribers.get(sessionId);
          if (!subscribers) {
            widelog.set("outcome", "skipped");
            widelog.flush();
            return;
          }

          if (subscribers.has(ws)) {
            widelog.set("outcome", "already_subscribed");
            widelog.flush();
            return;
          }

          subscribers.add(ws);

          try {
            await browserService.subscribeBrowser(sessionId);
            widelog.set("outcome", "success");
          } catch (error) {
            widelog.set("outcome", "error");
            widelog.errorFields(error);
          }

          widelog.flush();
        });
      },
      onUnsubscribe: ({ params, ws }) => {
        widelog.context(async () => {
          const sessionId = params.uuid;
          widelog.set("event_name", "websocket.browser_unsubscribe");
          widelog.set("session_id", sessionId ?? "unknown");

          if (!sessionId) {
            widelog.set("outcome", "skipped");
            widelog.flush();
            return;
          }

          const subscribers = sessionSubscribers.get(sessionId);

          if (!subscribers?.has(ws)) {
            widelog.set("outcome", "not_subscribed");
            widelog.flush();
            return;
          }

          subscribers.delete(ws);

          if (subscribers.size === 0) {
            sessionSubscribers.delete(sessionId);
          }

          try {
            await browserService.unsubscribeBrowser(sessionId);
            widelog.set("outcome", "success");
          } catch (error) {
            widelog.set("outcome", "error");
            widelog.errorFields(error);
          }

          widelog.flush();
        });
      },
    },
    sessionBrowserFrames: {
      getSnapshot: ({ params }) => {
        if (!params.uuid) {
          return Promise.resolve({ lastFrame: null, timestamp: null });
        }
        const frame = browserService.getCachedFrame(params.uuid);
        if (!frame) {
          return Promise.resolve({ lastFrame: null, timestamp: null });
        }
        return Promise.resolve({ lastFrame: frame, timestamp: Date.now() });
      },
    },
    sessionBrowserInput: {
      getSnapshot: () => Promise.resolve({}),
    },
    orchestrationStatus: {
      getSnapshot: () =>
        Promise.resolve({
          status: "pending",
          projectName: null,
          sessionId: null,
          errorMessage: null,
        }),
    },
    sessionComplete: {
      getSnapshot: () => Promise.resolve({ completed: false }),
    },
  };

  const options: HandlerOptions<AppSchema, Auth> = {
    authenticate: (token) => Promise.resolve({ userId: token ?? "anonymous" }),
    onMessage: (context, message) => {
      if (message.type === "send_message") {
        publisher.publishEvent(
          "sessionMessages",
          { uuid: message.sessionId },
          {
            id: message.id,
            role: MESSAGE_ROLE.USER,
            content: message.content,
            timestamp: message.timestamp,
            senderId: context.auth.userId,
          }
        );
      }
    },
  };

  return createWebSocketHandler(schema, handlers, options);
}
