import type { RouteHandler } from "../utils/route-handler";
import { opencode } from "../opencode";

const GET: RouteHandler = async () => {
  const response = await opencode.provider.list();

  if (response.error || !response.data) {
    return Response.json({ error: "Failed to fetch providers" }, { status: 500 });
  }

  const { all, connected } = response.data;
  const connectedSet = new Set(connected);

  const models = all
    .filter((provider) => connectedSet.has(provider.id))
    .flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        name: model.name,
      })),
    );

  return Response.json({ models });
};

export { GET };
