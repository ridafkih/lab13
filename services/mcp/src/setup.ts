import { DockerClient } from "@lab/sandbox-docker";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SERVER } from "./config/constants";
import type { env } from "./env";
import { bash } from "./tools/bash";
import { browser } from "./tools/browser";
import { container } from "./tools/container";
import { filesystem } from "./tools/filesystem";
import { github } from "./tools/github";
import { makeRegisterTool } from "./tools/register";
import { tasks } from "./tools/tasks";
import { webFetch } from "./tools/web-fetch";
import { initializeBucket } from "./utils/rustfs";

interface SetupOptions {
  env: (typeof env)["inferOut"];
}

type SetupFunction = (options: SetupOptions) => unknown;

export const setup = (async ({ env }) => {
  await initializeBucket(env);

  const docker = new DockerClient();

  const createServer = () => {
    const server = new McpServer({
      name: MCP_SERVER.NAME,
      version: MCP_SERVER.VERSION,
    });

    const { registerTool } = makeRegisterTool(server, docker, env);

    registerTool(bash);
    registerTool(filesystem);
    registerTool(browser);
    registerTool(container);
    registerTool(github);
    registerTool(webFetch);
    registerTool(tasks);

    return server;
  };

  return { createServer };
}) satisfies SetupFunction;
