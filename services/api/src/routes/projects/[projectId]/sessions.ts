import { findSessionsByProjectId } from "../../../repositories/session.repository";
import { spawnSession } from "../../../orchestration/session-spawner";
import { withParams } from "../../../shared/route-helpers";
import { parseRequestBody } from "../../../shared/validation";
import type { RouteContextFor } from "../../../types/route";
import { z } from "zod";

const createProjectSessionSchema = z.object({
  initialMessage: z.string().optional(),
  title: z.string().optional(),
});

const GET = withParams<{ projectId: string }>(["projectId"], async ({ projectId }, _request) => {
  const sessions = await findSessionsByProjectId(projectId);
  return Response.json(sessions);
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra" | "proxy">;

const POST = withParams<{ projectId: string }, OrchestrationContext>(
  ["projectId"],
  async ({ projectId }, request, context) => {
    const body = await parseRequestBody(request, createProjectSessionSchema);

    const result = await spawnSession({
      projectId,
      taskSummary: body.initialMessage ?? body.title,
      browserService: context.browserService,
      sessionLifecycle: context.sessionLifecycle,
      poolManager: context.poolManager,
      publisher: context.publisher,
      proxyBaseDomain: context.proxyBaseDomain,
    });

    return Response.json(
      {
        ...result.session,
        containers: result.containers,
      },
      { status: 201 },
    );
  },
);

export { GET, POST };
