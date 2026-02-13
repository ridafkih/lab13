import { z } from "zod";
import { widelog } from "../../logging";
import { initiateConversation } from "../../orchestration/conversation-initiator";
import { spawnSession } from "../../orchestration/session-spawner";
import { findProjectByIdOrThrow } from "../../repositories/project.repository";
import { parseRequestBody } from "../../shared/validation";
import type { Handler, RouteContextFor } from "../../types/route";

const createSessionRequestSchema = z.object({
  projectId: z.string().min(1),
  taskSummary: z.string().optional(),
  modelId: z.string().optional(),
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra">;

const POST: Handler<OrchestrationContext> = async ({ request, context }) => {
  const { projectId, taskSummary, modelId } = await parseRequestBody(
    request,
    createSessionRequestSchema
  );

  widelog.set("project.id", projectId);
  widelog.set("orchestration.has_task", !!taskSummary);
  widelog.set("orchestration.has_model_id", !!modelId);

  const project = await findProjectByIdOrThrow(projectId);

  const { session } = await spawnSession({
    projectId,
    taskSummary,
    browserService: context.browserService,
    sessionLifecycle: context.sessionLifecycle,
    poolManager: context.poolManager,
    publisher: context.publisher,
  });

  if (taskSummary) {
    await initiateConversation({
      sessionId: session.id,
      task: taskSummary,
      modelId,
      acp: context.acp,
      publisher: context.publisher,
      sessionStateStore: context.sessionStateStore,
    });
  }

  widelog.set("session.id", session.id);

  return Response.json(
    {
      sessionId: session.id,
      projectId: project.id,
      projectName: project.name,
    },
    { status: 201 }
  );
};

export { POST };
