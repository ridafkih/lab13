import type { RouteHandler } from "../../../utils/route-handler";
import { getCurrentUrl } from "../../../utils/agent-browser";

export const POST: RouteHandler = async (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const url = await getCurrentUrl(sessionId);
    return Response.json({ sessionId, launched: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
};
