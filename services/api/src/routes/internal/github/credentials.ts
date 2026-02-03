import type { RouteHandler } from "../../../utils/handlers/route-handler";
import { getGitHubCredentials } from "../../../utils/repositories/github-settings.repository";

const GET: RouteHandler = async () => {
  const credentials = await getGitHubCredentials();

  if (!credentials?.token) {
    return Response.json({ error: "GitHub not configured" }, { status: 404 });
  }

  return Response.json({
    token: credentials.token,
    username: credentials.username,
  });
};

export { GET };
