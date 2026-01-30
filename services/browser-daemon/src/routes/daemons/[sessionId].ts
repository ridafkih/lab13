import type { RouteHandler } from "../../utils/route-handler";

export const GET: RouteHandler = (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);

  return Response.json({
    type: "status",
    sessionId,
    running: daemonManager.isRunning(sessionId),
    ready: daemonManager.isReady(sessionId),
    port: session?.port ?? null,
  });
};

export const POST: RouteHandler = async (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const result = await daemonManager.start(sessionId);
  return Response.json(result);
};

export const DELETE: RouteHandler = (_request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const result = daemonManager.stop(sessionId);

  if (result.type === "not_found") {
    return Response.json(result, { status: 404 });
  }

  return Response.json(result);
};
