import { schema } from "@lab/multiplayer-channels";
import {
  createWebSocketHandler,
  type SchemaHandlers,
  type HandlerOptions,
} from "@lab/multiplayer-server";
import { db } from "@lab/database/client";
import { projects } from "@lab/database/schema/projects";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { containers } from "@lab/database/schema/containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { eq } from "drizzle-orm";
import { publisher } from "../publisher";
import { opencode } from "../opencode";
import { type BrowserService } from "../browser/browser-service";

const PROXY_BASE_DOMAIN = process.env.PROXY_BASE_DOMAIN;
if (!PROXY_BASE_DOMAIN) throw new Error("PROXY_BASE_DOMAIN must be defined");

export interface Auth {
  userId: string;
}

type Schema = typeof schema;

type ContainerStatus = "running" | "stopped" | "starting" | "error";
const isContainerStatus = (status: string): status is ContainerStatus =>
  status === "running" || status === "stopped" || status === "starting" || status === "error";

function getChangeType(before: string, after: string): "modified" | "created" | "deleted" {
  if (!before && after) return "created";
  if (before && !after) return "deleted";
  return "modified";
}

export const createWebSocketHandlers = (browserService: BrowserService) => {
  const sessionSubscribers = new Map<string, Set<object>>();

  const handlers: SchemaHandlers<Schema, Auth> = {
    projects: {
      getSnapshot: async () => {
        const allProjects = await db
          .select({ id: projects.id, name: projects.name })
          .from(projects);
        return allProjects;
      },
    },
    sessions: {
      getSnapshot: async () => {
        const allSessions = await db
          .select({
            id: sessions.id,
            projectId: sessions.projectId,
          })
          .from(sessions);
        return allSessions.map((session) => ({
          ...session,
          title: session.id.slice(0, 8),
        }));
      },
    },
    sessionMetadata: {
      getSnapshot: async () => ({ title: "", participantCount: 0 }),
    },
    sessionContainers: {
      getSnapshot: async ({ params }) => {
        const sessionId = params.uuid;
        const rows = await db
          .select({
            id: sessionContainers.id,
            containerId: sessionContainers.containerId,
            status: sessionContainers.status,
            hostname: containers.hostname,
            image: containers.image,
          })
          .from(sessionContainers)
          .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
          .where(eq(sessionContainers.sessionId, sessionId));

        const result = await Promise.all(
          rows.map(async (row) => {
            const ports = await db
              .select({ port: containerPorts.port })
              .from(containerPorts)
              .where(eq(containerPorts.containerId, row.containerId));

            const name = row.hostname ?? row.image.split("/").pop()?.split(":")[0] ?? "container";
            const urls = ports.map(({ port }) => ({
              port,
              url: `http://${sessionId}--${port}.${PROXY_BASE_DOMAIN}`,
            }));

            return {
              id: row.id,
              name,
              status: isContainerStatus(row.status) ? row.status : "error",
              urls,
            };
          }),
        );

        return result;
      },
    },
    sessionTyping: {
      getSnapshot: async () => [],
    },
    sessionPromptEngineers: {
      getSnapshot: async () => [],
    },
    sessionChangedFiles: {
      getSnapshot: async ({ params }) => {
        const session = await db
          .select({ opencodeSessionId: sessions.opencodeSessionId })
          .from(sessions)
          .where(eq(sessions.id, params.uuid))
          .limit(1);

        if (!session[0]?.opencodeSessionId) return [];

        try {
          const response = await opencode.session.diff({
            sessionID: session[0].opencodeSessionId,
          });

          if (!response.data) return [];

          return response.data.map((diff) => ({
            path: diff.file,
            originalContent: diff.before,
            currentContent: diff.after,
            status: "pending" as const,
            changeType: getChangeType(diff.before, diff.after),
          }));
        } catch {
          return [];
        }
      },
    },
    sessionBranches: {
      getSnapshot: async () => [],
    },
    sessionLinks: {
      getSnapshot: async () => [],
    },
    sessionLogs: {
      getSnapshot: async () => [],
    },
    sessionMessages: {
      getSnapshot: async () => [],
    },
    sessionBrowserState: {
      getSnapshot: async ({ params }) => {
        return browserService.getBrowserSnapshot(params.uuid);
      },
      onSubscribe: ({ params, ws }) => {
        const sessionId = params.uuid;

        if (!sessionSubscribers.has(sessionId)) {
          sessionSubscribers.set(sessionId, new Set());
        }
        const subscribers = sessionSubscribers.get(sessionId)!;

        if (subscribers.has(ws)) {
          return;
        }

        subscribers.add(ws);
        browserService.subscribeBrowser(sessionId);
      },
      onUnsubscribe: ({ params, ws }) => {
        const sessionId = params.uuid;
        const subscribers = sessionSubscribers.get(sessionId);

        if (!subscribers || !subscribers.has(ws)) {
          return;
        }

        subscribers.delete(ws);
        browserService.unsubscribeBrowser(sessionId);
      },
    },
    sessionBrowserFrames: {
      getSnapshot: async ({ params }) => {
        const frame = browserService.getCachedFrame(params.uuid);
        if (!frame) return { lastFrame: null, timestamp: null };
        return { lastFrame: frame, timestamp: Date.now() };
      },
    },
    sessionBrowserInput: {
      getSnapshot: async () => ({}),
    },
  };

  const options: HandlerOptions<Schema, Auth> = {
    authenticate: async (token) => ({ userId: token ?? "anonymous" }),
    onMessage: async (context, message) => {
      if (message.type === "send_message") {
        publisher.publishEvent(
          "sessionMessages",
          { uuid: message.sessionId },
          {
            id: message.id,
            role: "user",
            content: message.content,
            timestamp: message.timestamp,
            senderId: context.auth.userId,
          },
        );
      }
    },
  };

  return createWebSocketHandler(schema, handlers, options);
};
