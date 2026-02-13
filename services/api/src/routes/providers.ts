import { widelog } from "../logging";
import type { Handler, InfraContext } from "../types/route";

const GET: Handler<InfraContext> = async ({ context }) => {
  const response = await context.acp.listAgents();
  widelog.set("agent.count", response.agents.length);
  return Response.json({ agents: response.agents });
};

export { GET };
