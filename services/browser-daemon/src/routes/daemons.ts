import type { RouteHandler } from "../utils/route-handler";

export const GET: RouteHandler = (_request, _params, { daemonManager }) => {
  const sessions = daemonManager.getAllSessions();
  return Response.json({ daemons: sessions });
};
