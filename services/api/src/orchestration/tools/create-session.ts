import { tool } from "ai";
import { z } from "zod";
import type { AcpClient } from "../../acp/client";
import { widelog } from "../../logging";
import type { BrowserServiceManager } from "../../managers/browser-service.manager";
import type { PoolManager } from "../../managers/pool.manager";
import type { SessionLifecycleManager } from "../../managers/session-lifecycle.manager";
import { findProjectById } from "../../repositories/project.repository";
import type { SessionStateStore } from "../../state/session-state-store";
import type { Publisher } from "../../types/dependencies";
import { initiateConversation } from "../conversation-initiator";
import { spawnSession } from "../session-spawner";

interface CreateSessionToolContext {
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  modelId?: string;
  acp: AcpClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

const inputSchema = z.object({
  projectId: z.string().describe("The project ID to create the session for"),
  taskSummary: z.string().describe("A summary of the task to work on"),
});

export function createCreateSessionTool(context: CreateSessionToolContext) {
  return tool({
    description:
      "Creates a new session for a project and starts working on a task. Use this when the user wants to start a new coding task.",
    inputSchema,
    execute: async ({ projectId, taskSummary }) => {
      const project = await findProjectById(projectId);

      if (!project) {
        return {
          error: "Project not found",
          sessionId: null,
          projectName: null,
        };
      }

      try {
        const { session } = await spawnSession({
          projectId,
          taskSummary,
          browserService: context.browserService,
          sessionLifecycle: context.sessionLifecycle,
          poolManager: context.poolManager,
          publisher: context.publisher,
        });

        // Fire agent session creation without awaiting — container init
        // is already running in background, so the agent can start in parallel.
        initiateConversation({
          sessionId: session.id,
          task: taskSummary,
          modelId: context.modelId,
          acp: context.acp,
          publisher: context.publisher,
          sessionStateStore: context.sessionStateStore,
        }).catch((error) => {
          widelog.context(() => {
            widelog.set(
              "event_name",
              "create_session.initiate_conversation_failed"
            );
            widelog.set("session_id", session.id);
            widelog.set("outcome", "error");
            widelog.errorFields(error);
            widelog.flush();
          });
        });

        return {
          sessionId: session.id,
          projectName: project.name,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          error: `Failed to create session: ${message}`,
          sessionId: null,
          projectName: null,
        };
      }
    },
  });
}
