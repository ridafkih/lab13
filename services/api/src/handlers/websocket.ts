import { schema } from "@lab/multiplayer-channels";
import {
  createWebSocketHandler,
  type SchemaHandlers,
  type HandlerOptions,
} from "@lab/multiplayer-server";
import { db } from "@lab/database/client";
import { projects } from "@lab/database/schema/projects";
import { sessions } from "@lab/database/schema/sessions";

export interface Auth {
  userId: string;
}

type Schema = typeof schema;

const handlers: SchemaHandlers<Schema, Auth> = {
  projects: {
    getSnapshot: async () => {
      const allProjects = await db.select({ id: projects.id, name: projects.name }).from(projects);
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
      return allSessions.map((s) => ({ ...s, title: `Session ${s.id.slice(0, 8)}` }));
    },
  },
  sessionMetadata: {
    getSnapshot: async () => ({ title: "", participantCount: 0 }),
  },
  sessionMessages: {
    getSnapshot: async () => [],
  },
  sessionTyping: {
    getSnapshot: async () => [],
  },
  sessionPromptEngineers: {
    getSnapshot: async () => [],
  },
  sessionChangedFiles: {
    getSnapshot: async () => [],
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
  sessionStream: {
    getSnapshot: async () => ({ active: false }),
  },
  sessionAgentTools: {
    getSnapshot: async () => [],
  },
};

const options: HandlerOptions<Schema, Auth> = {
  authenticate: async (token) => ({ userId: token ?? "anonymous" }),
  onMessage: async (ctx, message) => {
    console.log("Received message:", message, "from user:", ctx.auth.userId);
  },
};

export const { websocketHandler, upgrade } = createWebSocketHandler(schema, handlers, options);
