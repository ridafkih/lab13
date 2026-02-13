import { buildSseResponse } from "@lab/http-utilities";
import { z } from "zod";
import { getPlatformConfig } from "../../config/platforms";
import { widelog } from "../../logging";
import {
  chatOrchestrate,
  chatOrchestrateStream,
} from "../../orchestration/chat-orchestrator/execute";
import type { ChatOrchestratorResult } from "../../orchestration/chat-orchestrator/types";
import {
  getConversationHistory,
  saveOrchestratorMessage,
} from "../../repositories/orchestrator-message.repository";
import { parseRequestBody } from "../../shared/validation";
import { MESSAGE_ROLE } from "../../types/message";
import type { Handler, RouteContextFor } from "../../types/route";

const chatRequestSchema = z.object({
  content: z.string().min(1),
  platformOrigin: z.string(),
  platformChatId: z.string(),
  modelId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra">;

const POST: Handler<OrchestrationContext> = async ({ request, context }) => {
  const body = await parseRequestBody(request, chatRequestSchema);
  const content = body.content.trim();

  widelog.set("orchestration.platform_origin", body.platformOrigin);
  widelog.set("orchestration.platform_chat_id", body.platformChatId);
  widelog.set("orchestration.has_model_id", !!body.modelId);

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

  widelog.set("orchestration.history_count", conversationHistory.length);

  const platformConfig = getPlatformConfig(body.platformOrigin);
  widelog.set("orchestration.streaming", platformConfig.breakDoubleNewlines);

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
        acp: context.acp,
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
      }
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
    acp: context.acp,
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
  generator: AsyncGenerator<
    { type: "chunk"; text: string },
    ChatOrchestratorResult,
    unknown
  >,
  onComplete: (result: ChatOrchestratorResult) => Promise<void>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const streamChunks = async (): Promise<ChatOrchestratorResult> => {
        while (true) {
          const iteration = await generator.next();
          if (iteration.done) {
            return iteration.value;
          }
          const chunk = iteration.value;
          const event = `event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }
      };

      try {
        const finalResult = await streamChunks();

        // Save the message
        await onComplete(finalResult);

        // Send the done event with full result
        const doneEvent = `event: done\ndata: ${JSON.stringify(finalResult)}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        controller.close();
      } catch (error) {
        widelog.errorFields(error, { prefix: "orchestration.stream_error" });
        widelog.set("orchestration.stream_outcome", "error");
        const errorMessage =
          error instanceof Error ? error.message : "Stream failed";
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });
}

export { POST };
