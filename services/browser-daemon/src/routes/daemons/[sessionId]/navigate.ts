import { z } from "zod";
import type { RouteHandler } from "../../../utils/route-handler";
import { navigate } from "../../../utils/agent-browser";

const NavigateBody = z.object({
  url: z.string().url(),
});

export const POST: RouteHandler = async (request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (!daemonManager.isReady(sessionId)) {
    return Response.json({ error: "Session not ready" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = NavigateBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "URL required", details: parsed.error.flatten() }, { status: 400 });
  }

  const { url } = parsed.data;

  console.log(`[Navigate] ${sessionId} -> ${url}`);

  try {
    await navigate(sessionId, url);
    console.log(`[Navigate] ${sessionId} complete`);
    return Response.json({ sessionId, navigated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Navigate] ${sessionId} failed: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
};
