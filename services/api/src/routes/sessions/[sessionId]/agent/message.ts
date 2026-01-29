import { z } from "zod";
import type { RouteHandler } from "../../../../utils/route-handler";
import { getAgentSession } from "../../../../agent";

const MessageBodySchema = z.object({
  message: z.string().min(1),
  model: z
    .object({
      providerId: z.string(),
      modelId: z.string(),
    })
    .optional(),
});

const POST: RouteHandler = async (request, params) => {
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;

  const session = getAgentSession(sessionId);
  if (!session) {
    return Response.json({ error: "Agent not started for this session" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = MessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  if (session.isActive) {
    return Response.json({ error: "Agent is currently processing a message" }, { status: 409 });
  }

  try {
    await session.sendMessage(parsed.data.message, parsed.data.model);
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process message";
    return Response.json({ error: message }, { status: 500 });
  }
};

export { POST };
