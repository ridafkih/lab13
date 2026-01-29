import type { RouteHandler } from "../utils/route-handler";

const GET: RouteHandler = async () => {
  const projects = [
    { id: "1", name: "Project Alpha" },
    { id: "2", name: "Project Beta" },
  ];
  return Response.json(projects);
};

const POST: RouteHandler = async (request) => {
  const body = await request.json();
  const project = {
    id: crypto.randomUUID(),
    name: body.name,
  };
  return Response.json(project, { status: 201 });
};

export { GET, POST };
