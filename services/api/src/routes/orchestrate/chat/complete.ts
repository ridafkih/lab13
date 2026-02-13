import { z } from "zod";
import { generateTaskSummary } from "../../../generators/summary.generator";
import { widelog } from "../../../logging";
import { findOrchestrationBySessionIdOrThrow } from "../../../repositories/orchestration-request.repository";
import { saveOrchestratorMessage } from "../../../repositories/orchestrator-message.repository";
import { parseRequestBody } from "../../../shared/validation";
import { MESSAGE_ROLE } from "../../../types/message";
import type { Handler, RouteContextFor } from "../../../types/route";

const completeRequestSchema = z.object({
  sessionId: z.string(),
  platformOrigin: z.string(),
  platformChatId: z.string(),
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra">;

const POST: Handler<OrchestrationContext> = async ({ request }) => {
  const { sessionId, platformOrigin, platformChatId } = await parseRequestBody(
    request,
    completeRequestSchema
  );

  widelog.set("session.id", sessionId);
  widelog.set("orchestration.platform_origin", platformOrigin);
  widelog.set("orchestration.platform_chat_id", platformChatId);

  const orchestration = await findOrchestrationBySessionIdOrThrow(sessionId);
  const summary = await generateTaskSummary({
    sessionId,
    originalTask: orchestration.content,
    platformOrigin,
  });

  const completionMessage = summary.summary.trim();
  widelog.set("summary.success", summary.success);
  widelog.set("summary.outcome", summary.outcome);

  await saveOrchestratorMessage({
    platform: platformOrigin,
    platformChatId,
    role: MESSAGE_ROLE.ASSISTANT,
    content: completionMessage,
    sessionId,
  });

  return Response.json(
    {
      action: "response",
      message: completionMessage,
      sessionId,
    },
    { status: 200 }
  );
};

export { POST };
