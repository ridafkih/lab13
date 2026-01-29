import type { RouteHandler } from "../../utils/route-handler";

const GET: RouteHandler = async (_request, params) => {
  const { sessionId } = params;
  const session = {
    id: sessionId,
    projectId: "1",
    title: `Session ${sessionId}`,
    messages: [],
  };
  return Response.json(session);
};

export { GET };
