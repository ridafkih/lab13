import { DockerClient } from "@lab/sandbox-docker";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_SERVER } from "./config/constants";
import type { env } from "./env";
import { bash } from "./tools/bash";
import { browser } from "./tools/browser";
import { container } from "./tools/container";
import { github } from "./tools/github";
import { makeRegisterTool } from "./tools/register";
import { initializeBucket } from "./utils/rustfs";

interface SetupOptions {
  env: (typeof env)["inferOut"];
}

type SetupFunction = (options: SetupOptions) => unknown;

export const setup = (async ({ env }) => {
  await initializeBucket(env);

  const docker = new DockerClient();

  const server = new McpServer({
    name: MCP_SERVER.NAME,
    version: MCP_SERVER.VERSION,
  });

  const { registerTool } = makeRegisterTool(server, docker, env);

  registerTool(bash);
  registerTool(browser);
  registerTool(container);
  registerTool(github);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  return { server, transport };
}) satisfies SetupFunction;
