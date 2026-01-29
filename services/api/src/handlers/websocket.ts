import { schema } from "@lab/multiplayer-channels";
import {
  createWebSocketHandler,
  type SchemaHandlers,
  type HandlerOptions,
} from "@lab/multiplayer-server";

export interface Auth {
  userId: string;
}

type Schema = typeof schema;

const handlers: SchemaHandlers<Schema, Auth> = {
  projects: {
    getSnapshot: async () => [],
  },
  sessions: {
    getSnapshot: async () => [],
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
};

const options: HandlerOptions<Schema, Auth> = {
  authenticate: async (token) => ({ userId: token ?? "anonymous" }),
  onMessage: async (ctx, message) => {
    console.log("Received message:", message, "from user:", ctx.auth.userId);
  },
};

export const { websocketHandler, upgrade } = createWebSocketHandler(schema, handlers, options);
