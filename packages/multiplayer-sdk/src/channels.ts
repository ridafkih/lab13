import { z } from "zod";
import { defineChannel, defineSchema } from "./schema";

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
      path: "session/:uuid/metadata",
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
      path: "session/:uuid/containers",
      snapshot: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.enum(["running", "stopped", "starting", "error"]),
          urls: z.array(z.object({ port: z.number(), url: z.string() })),
        }),
      ),
      default: [],
      delta: z.object({
        type: z.enum(["update"]),
        container: z.object({
          id: z.string(),
          status: z.enum(["running", "stopped", "starting", "error"]),
        }),
      }),
    }),

    sessionTyping: defineChannel({
      path: "session/:uuid/typing",
      snapshot: z.array(
        z.object({
          userId: z.string(),
          isTyping: z.boolean(),
        }),
      ),
      default: [],
    }),

    sessionPromptEngineers: defineChannel({
      path: "session/:uuid/prompt-engineers",
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
      path: "session/:uuid/changed_files",
      snapshot: z.array(ReviewableFileSchema),
      default: [],
      delta: z.object({
        type: z.enum(["add", "update", "remove"]),
        file: ReviewableFileSchema,
      }),
    }),

    sessionBranches: defineChannel({
      path: "session/:uuid/branches",
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
      path: "session/:uuid/links",
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
      path: "session/:uuid/logs",
      snapshot: z.array(LogSourceSchema),
      default: [],
      event: LogEntrySchema,
    }),

    sessionMessages: defineChannel({
      path: "session/:uuid/messages",
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

    sessionBrowserState: defineChannel({
      path: "session/:uuid/browser-state",
      snapshot: z.object({
        desiredState: z.enum(["running", "stopped"]),
        currentState: z.enum(["pending", "stopped", "starting", "running", "stopping", "error"]),
        streamPort: z.number().optional(),
        errorMessage: z.string().optional(),
      }),
      default: { desiredState: "stopped", currentState: "stopped" },
      delta: z.object({
        desiredState: z.enum(["running", "stopped"]).optional(),
        currentState: z
          .enum(["pending", "stopped", "starting", "running", "stopping", "error"])
          .optional(),
        streamPort: z.number().optional(),
        errorMessage: z.string().optional(),
      }),
    }),

    sessionBrowserFrames: defineChannel({
      path: "session/:uuid/browser-frames",
      snapshot: z.object({
        lastFrame: z.string().nullable(),
        timestamp: z.number().nullable(),
      }),
      default: { lastFrame: null, timestamp: null },
      event: z.object({
        type: z.literal("frame"),
        data: z.string(),
        timestamp: z.number(),
      }),
    }),

    sessionBrowserInput: defineChannel({
      path: "session/:uuid/browser-input",
      snapshot: z.object({}),
      default: {},
      event: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("mouse_click"),
          x: z.number(),
          y: z.number(),
          button: z.enum(["left", "right", "middle"]).optional(),
        }),
        z.object({
          type: z.literal("mouse_move"),
          x: z.number(),
          y: z.number(),
        }),
        z.object({
          type: z.literal("key_press"),
          key: z.string(),
          modifiers: z.array(z.enum(["ctrl", "alt", "shift", "meta"])).optional(),
        }),
        z.object({
          type: z.literal("key_release"),
          key: z.string(),
        }),
        z.object({
          type: z.literal("scroll"),
          deltaX: z.number(),
          deltaY: z.number(),
        }),
        z.object({
          type: z.literal("type_text"),
          text: z.string(),
        }),
      ]),
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

export type AppSchema = typeof schema;
export type ClientMessage = z.infer<typeof schema.clientMessages>;
