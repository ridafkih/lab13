import type { DockerClient } from "@lab/sandbox-docker";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { resolveBoundLabSessionId } from "../utils/session-binding";

interface SessionServicesResponse {
  sessionId: string;
  proxyBaseUrl: string;
  services: {
    containerId: string;
    runtimeId: string;
    image: string;
    status: string;
    ports: number[];
  }[];
}

interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: { type: "text"; text: string }[];
}

async function getSessionServices(
  apiBaseUrl: string,
  sessionId: string
): Promise<SessionServicesResponse | null> {
  const response = await fetch(
    `${apiBaseUrl}/internal/sessions/${sessionId}/services`
  );
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function sessionNotFoundError(sessionId: string): ToolResult {
  return errorResult(
    `Error: Could not find session "${sessionId}". Make sure the session exists.`
  );
}

function serviceNotFoundError(
  containerId: string,
  available: string[]
): ToolResult {
  return errorResult(
    `Error: Service "${containerId}" not found. Available services: ${available.join(", ") || "(none)"}`
  );
}

function portNotFoundError(port: number, available: number[]): ToolResult {
  return errorResult(
    `Error: No service found on port ${port}. Available ports: ${available.join(", ") || "(none)"}`
  );
}

function containerNotRunningError(containerId: string): ToolResult {
  return errorResult(`Error: Container "${containerId}" is not running`);
}

function formatSessionNetworkName(sessionId: string): string {
  return `lab-${sessionId}`;
}

async function ensureSharedContainerConnected(
  docker: DockerClient,
  sessionId: string,
  containerName: string
): Promise<void> {
  const networkName = formatSessionNetworkName(sessionId);
  const networkExists = await docker.networkExists(networkName);
  if (!networkExists) {
    throw new Error(`Session network "${networkName}" not found`);
  }

  const connected = await docker.isConnectedToNetwork(
    containerName,
    networkName
  );
  if (connected) {
    return;
  }

  await docker.connectToNetwork(containerName, networkName);
}

export function container(server: McpServer, { docker, config }: ToolContext) {
  function resolveSessionId(
    providedSessionId: string | undefined,
    extra: unknown
  ): { sessionId: string } | { error: ToolResult } {
    const resolvedSession = resolveBoundLabSessionId(
      extra as Parameters<typeof resolveBoundLabSessionId>[0],
      providedSessionId
    );
    if ("error" in resolvedSession) {
      return {
        error: errorResult(
          `${resolvedSession.error} (tool: Containers/Logs/RestartProcess/InternalUrl/PublicUrl)`
        ),
      };
    }
    return { sessionId: resolvedSession.sessionId };
  }

  server.registerTool(
    "Containers",
    {
      description:
        "List all running containers in the session. Shows containerId, image, status, and exposed ports.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
      },
    },
    async (args, extra) => {
      const resolved = resolveSessionId(args.sessionId, extra);
      if ("error" in resolved) {
        return resolved.error;
      }
      const data = await getSessionServices(
        config.API_BASE_URL,
        resolved.sessionId
      );
      if (!data) {
        return sessionNotFoundError(resolved.sessionId);
      }

      if (data.services.length === 0) {
        return textResult("No running processes found in this session.");
      }

      const output = data.services.map((service) => ({
        containerId: service.containerId,
        image: service.image,
        status: service.status,
        ports: service.ports,
      }));

      return textResult(JSON.stringify(output, null, 2));
    }
  );

  server.registerTool(
    "Logs",
    {
      description:
        "View recent logs from a container. Use `Containers` to see available IDs.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
        containerId: z.string().describe("The containerId (from `Containers`)"),
        tail: z
          .number()
          .optional()
          .describe("Number of lines to retrieve (default: 100)"),
      },
    },
    async (args, extra) => {
      const resolved = resolveSessionId(args.sessionId, extra);
      if ("error" in resolved) {
        return resolved.error;
      }
      const data = await getSessionServices(
        config.API_BASE_URL,
        resolved.sessionId
      );
      if (!data) {
        return sessionNotFoundError(resolved.sessionId);
      }

      const service = data.services.find(
        (candidate) => candidate.containerId === args.containerId
      );
      if (!service) {
        const available = data.services.map(
          (candidate) => candidate.containerId
        );
        return serviceNotFoundError(args.containerId, available);
      }

      const exists = await docker.containerExists(service.runtimeId);
      if (!exists) {
        return containerNotRunningError(args.containerId);
      }

      const lines = args.tail ?? 100;
      const logs: string[] = [];
      for await (const chunk of docker.streamLogs(service.runtimeId, {
        tail: lines,
      })) {
        const text = new TextDecoder().decode(chunk.data);
        logs.push(`[${chunk.stream}] ${text}`);
      }

      return textResult(logs.join("") || "(no logs)");
    }
  );

  server.registerTool(
    "RestartProcess",
    {
      description:
        "Restart a container. Use `Containers` to see available IDs.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
        containerId: z
          .string()
          .describe("The containerId to restart (from `Containers`)"),
        timeout: z
          .number()
          .optional()
          .describe("Seconds to wait before killing (default: 10)"),
      },
    },
    async (args, extra) => {
      const resolved = resolveSessionId(args.sessionId, extra);
      if ("error" in resolved) {
        return resolved.error;
      }
      const data = await getSessionServices(
        config.API_BASE_URL,
        resolved.sessionId
      );
      if (!data) {
        return sessionNotFoundError(resolved.sessionId);
      }

      const service = data.services.find(
        (candidate) => candidate.containerId === args.containerId
      );
      if (!service) {
        const available = data.services.map(
          (candidate) => candidate.containerId
        );
        return serviceNotFoundError(args.containerId, available);
      }

      const exists = await docker.containerExists(service.runtimeId);
      if (!exists) {
        return containerNotRunningError(args.containerId);
      }

      const timeout = args.timeout ?? 10;
      await docker.restartContainer(service.runtimeId, timeout);

      return textResult(
        `Successfully restarted container "${args.containerId}"`
      );
    }
  );

  server.registerTool(
    "InternalUrl",
    {
      description:
        "Get the internal URL for a container port. Use with the browser tool or curl/fetch.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number (from `Containers`)"),
      },
    },
    async (args, extra) => {
      const resolved = resolveSessionId(args.sessionId, extra);
      if ("error" in resolved) {
        return resolved.error;
      }
      const data = await getSessionServices(
        config.API_BASE_URL,
        resolved.sessionId
      );
      if (!data) {
        return sessionNotFoundError(resolved.sessionId);
      }

      const service = data.services.find(({ ports }) =>
        ports.includes(args.port)
      );
      if (!service) {
        const availablePorts = data.services.flatMap(({ ports }) => ports);
        return portNotFoundError(args.port, availablePorts);
      }

      try {
        await ensureSharedContainerConnected(
          docker,
          resolved.sessionId,
          config.BROWSER_CONTAINER_NAME
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(
          `Error: Failed to ensure browser connectivity for session "${resolved.sessionId}": ${message}`
        );
      }

      const internalUrl = `${config.CONTAINER_SCHEME}//${resolved.sessionId}--${args.port}:${args.port}`;

      return textResult(
        `Internal URL: ${internalUrl}\n\nYou can use this URL with:\n- agent-browser: Navigate to this URL to interact with the service\n- curl/fetch: Make HTTP requests from within the workspace container\n\n This URL is not relevant to the user.`
      );
    }
  );

  server.registerTool(
    "PublicUrl",
    {
      description:
        "Get the public URL for a container port. Share with the user to access in their browser.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number (from `Containers`)"),
      },
    },
    async (args, extra) => {
      const resolved = resolveSessionId(args.sessionId, extra);
      if ("error" in resolved) {
        return resolved.error;
      }
      const data = await getSessionServices(
        config.API_BASE_URL,
        resolved.sessionId
      );
      if (!data) {
        return sessionNotFoundError(resolved.sessionId);
      }

      const service = data.services.find(({ ports }) =>
        ports.includes(args.port)
      );
      if (!service) {
        const availablePorts = data.services.flatMap(({ ports }) => ports);
        return portNotFoundError(args.port, availablePorts);
      }

      const externalUrl = new URL(data.proxyBaseUrl);
      externalUrl.hostname = `${resolved.sessionId}--${args.port}.${externalUrl.hostname}`;

      return textResult(
        `External URL: ${externalUrl.origin}\n\nShare this URL with the user so they can access the service in their browser.`
      );
    }
  );
}
