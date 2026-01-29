import { z } from "zod";
import { defineChannel, defineSchema } from "@lab/multiplayer-shared";

const ReviewableFileSchema = z.object({
  path: z.string(),
  originalContent: z.string(),
  currentContent: z.string(),
  status: z.enum(["pending", "dismissed"]),
  changeType: z.enum(["modified", "created", "deleted"]),
});

const LogSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["container", "process", "file"]),
});

const LogEntrySchema = z.object({
  sourceId: z.string(),
  timestamp: z.number(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
});

const SessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  hasUnread: z.boolean().optional(),
  isWorking: z.boolean().optional(),
});

export const schema = defineSchema({
  channels: {
    projects: defineChannel({
      path: "projects",
      snapshot: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        }),
      ),
      default: [],
      delta: z.object({
        type: z.enum(["add", "update", "remove"]),
        project: z.object({ id: z.string(), name: z.string() }),
      }),
    }),

    sessions: defineChannel({
      path: "sessions",
      snapshot: z.array(SessionSchema),
      default: [],
      delta: z.object({
        type: z.enum(["add", "update", "remove"]),
        session: SessionSchema,
      }),
    }),

    sessionMetadata: defineChannel({
      path: "session/{uuid}/metadata",
      snapshot: z.object({
        title: z.string(),
        lastMessage: z.string().optional(),
        participantCount: z.number(),
      }),
      default: { title: "", participantCount: 0 },
      delta: z.object({
        title: z.string().optional(),
        lastMessage: z.string().optional(),
      }),
    }),

    sessionContainers: defineChannel({
      path: "session/{uuid}/containers",
      snapshot: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.enum(["running", "stopped", "error"]),
          urls: z.array(z.object({ port: z.number(), url: z.string() })),
        }),
      ),
      default: [],
    }),

    sessionTyping: defineChannel({
      path: "session/{uuid}/typing",
      snapshot: z.array(
        z.object({
          userId: z.string(),
          isTyping: z.boolean(),
        }),
      ),
      default: [],
    }),

    sessionPromptEngineers: defineChannel({
      path: "session/{uuid}/prompt-engineers",
      snapshot: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          avatar: z.string().optional(),
        }),
      ),
      default: [],
    }),

    sessionChangedFiles: defineChannel({
      path: "session/{uuid}/changed_files",
      snapshot: z.array(ReviewableFileSchema),
      default: [],
      delta: z.object({
        type: z.enum(["add", "update", "remove"]),
        file: ReviewableFileSchema,
      }),
    }),

    sessionBranches: defineChannel({
      path: "session/{uuid}/branches",
      snapshot: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          prNumber: z.number().optional(),
          prUrl: z.string().optional(),
        }),
      ),
      default: [],
    }),

    sessionLinks: defineChannel({
      path: "session/{uuid}/links",
      snapshot: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          url: z.string(),
        }),
      ),
      default: [],
    }),

    sessionLogs: defineChannel({
      path: "session/{uuid}/logs",
      snapshot: z.array(LogSourceSchema),
      default: [],
      event: LogEntrySchema,
    }),

    sessionMessages: defineChannel({
      path: "session/{uuid}/messages",
      snapshot: z.array(z.never()),
      default: [],
      event: z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.number(),
        senderId: z.string(),
      }),
    }),
  },

  clientMessages: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("send_message"),
      id: z.string(),
      sessionId: z.string(),
      content: z.string(),
      timestamp: z.number(),
    }),
    z
      .object({
        type: z.literal("set_typing"),
        isTyping: z.boolean(),
      })
      .passthrough(),
  ]),
});

export type Schema = typeof schema;
export type ClientMessage = z.infer<typeof schema.clientMessages>;
