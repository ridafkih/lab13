import { z } from "zod";
import type { RouteHandler } from "../../../utils/handlers/route-handler";
import { chatOrchestrate } from "../../../utils/orchestration/chat-orchestrator";
import {
  saveOrchestratorMessage,
  getOrchestratorMessages,
} from "../../../utils/repositories/orchestrator-message.repository";

const completeRequestSchema = z.object({
  sessionId: z.string(),
  platformOrigin: z.string(),
  platformChatId: z.string(),
});

const POST: RouteHandler = async (request, _params, context) => {
  const rawBody = await request.json().catch(() => null);
  const parseResult = completeRequestSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return Response.json(
      {
        error:
          "Invalid request body. Required: { sessionId: string, platformOrigin: string, platformChatId: string }",
      },
      { status: 400 },
    );
  }

  const { sessionId, platformOrigin, platformChatId } = parseResult.data;

  try {
    await saveOrchestratorMessage({
      platform: platformOrigin,
      platformChatId,
      role: "assistant",
      content:
        "I just received a notification that the session has completed. Let me check what happened.",
      sessionId,
    });

    const history = await getOrchestratorMessages({
      platform: platformOrigin,
      platformChatId,
      limit: 20,
    });

    const conversationHistory = history.map((msg) => `${msg.role}: ${msg.content}`);

    const result = await chatOrchestrate({
      content: `Session ${sessionId} has completed. Check what was accomplished and include a screenshot if appropriate.`,
      conversationHistory,
      platformOrigin,
      platformChatId,
      browserService: context.browserService,
    });

    await saveOrchestratorMessage({
      platform: platformOrigin,
      platformChatId,
      role: "assistant",
      content: result.message,
      sessionId,
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[ChatComplete] Error:", error);
    const message = error instanceof Error ? error.message : "Session complete notification failed";
    return Response.json({ error: message }, { status: 500 });
  }
};

export { POST };
