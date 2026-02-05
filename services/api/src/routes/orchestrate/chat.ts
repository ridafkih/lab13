import { z } from "zod";
import type { Handler, RouteContextFor } from "../../types/route";
import {
  chatOrchestrate,
  chatOrchestrateStream,
  type ChatOrchestratorResult,
} from "../../orchestration/chat-orchestrator";
import {
  saveOrchestratorMessage,
  getConversationHistory,
} from "../../repositories/orchestrator-message.repository";
import { getPlatformConfig } from "../../config/platforms";
import { buildSseResponse } from "@lab/http-utilities";
import { parseRequestBody } from "../../shared/validation";
import { MESSAGE_ROLE } from "../../types/message";
import { widelog } from "../../logging";

const chatRequestSchema = z.object({
  content: z.string().min(1),
  platformOrigin: z.string(),
  platformChatId: z.string(),
  modelId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra">;

const POST: Handler<OrchestrationContext> = async (request, _params, context) => {
  const body = await parseRequestBody(request, chatRequestSchema);
  const content = body.content.trim();

  await saveOrchestratorMessage({
    platform: body.platformOrigin,
    platformChatId: body.platformChatId,
    role: MESSAGE_ROLE.USER,
    content,
  });

  const conversationHistory = await getConversationHistory({
    platform: body.platformOrigin,
    platformChatId: body.platformChatId,
    limit: 20,
  });

  const platformConfig = getPlatformConfig(body.platformOrigin);

  if (platformConfig.breakDoubleNewlines) {
    // Return SSE stream for platforms that support chunked delivery
    const stream = createSseStream(
      chatOrchestrateStream({
        content,
        conversationHistory,
        platformOrigin: body.platformOrigin,
        platformChatId: body.platformChatId,
        browserService: context.browserService,
        sessionLifecycle: context.sessionLifecycle,
        poolManager: context.poolManager,
        modelId: body.modelId,
        timestamp: body.timestamp,
        opencode: context.opencode,
        publisher: context.publisher,
        imageStore: context.imageStore,
        sessionStateStore: context.sessionStateStore,
      }),
      async (result) => {
        await saveOrchestratorMessage({
          platform: body.platformOrigin,
          platformChatId: body.platformChatId,
          role: MESSAGE_ROLE.ASSISTANT,
          content: result.message,
          sessionId: result.sessionId,
        });
      },
    );

    return buildSseResponse(stream);
  }

  // Standard non-streaming response
  const result = await chatOrchestrate({
    content,
    conversationHistory,
    platformOrigin: body.platformOrigin,
    platformChatId: body.platformChatId,
    browserService: context.browserService,
    sessionLifecycle: context.sessionLifecycle,
    poolManager: context.poolManager,
    modelId: body.modelId,
    timestamp: body.timestamp,
    opencode: context.opencode,
    publisher: context.publisher,
    imageStore: context.imageStore,
    sessionStateStore: context.sessionStateStore,
  });

  await saveOrchestratorMessage({
    platform: body.platformOrigin,
    platformChatId: body.platformChatId,
    role: MESSAGE_ROLE.ASSISTANT,
    content: result.message,
    sessionId: result.sessionId,
  });

  return Response.json(result, { status: 200 });
};

function createSseStream(
  generator: AsyncGenerator<{ type: "chunk"; text: string }, ChatOrchestratorResult, unknown>,
  onComplete: (result: ChatOrchestratorResult) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let result = await generator.next();

        while (!result.done) {
          const chunk = result.value;
          const event = `event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`;
          controller.enqueue(encoder.encode(event));
          result = await generator.next();
        }

        // result.value contains the final ChatOrchestratorResult
        const finalResult = result.value;

        // Save the message
        await onComplete(finalResult);

        // Send the done event with full result
        const doneEvent = `event: done\ndata: ${JSON.stringify(finalResult)}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        controller.close();
      } catch (error) {
        widelog.errorFields(error, { prefix: "orchestration.stream_error" });
        widelog.set("orchestration.stream_outcome", "error");
        const errorMessage = error instanceof Error ? error.message : "Stream failed";
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });
}

export { POST };
