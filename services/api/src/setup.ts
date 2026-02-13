import { createImageStoreFromEnv } from "@lab/context";
import {
  DockerClient,
  DockerNetworkManager,
  DockerRuntimeManager,
  DockerSessionManager,
  DockerWorkspaceManager,
} from "@lab/sandbox-docker";
import { Sandbox } from "@lab/sandbox-sdk";
import { RedisClient } from "bun";
import { createAcpClient } from "./acp/client";
import { createAuth } from "./auth";
import { ApiServer } from "./clients/server";
import type { env } from "./env";
import { widelog } from "./logging";
import { BrowserServiceManager } from "./managers/browser-service.manager";
import { PoolManager } from "./managers/pool.manager";
import { SessionLifecycleManager } from "./managers/session-lifecycle.manager";
import { AcpMonitor } from "./monitors/acp.monitor";
import { ContainerMonitor } from "./monitors/container.monitor";
import { LogMonitor } from "./monitors/log.monitor";
import { NetworkReconcileMonitor } from "./monitors/network-reconcile.monitor";
import { createDefaultPromptService } from "./prompts/builder";
import { ProxyManager } from "./services/proxy.service";
import { DeferredPublisher } from "./shared/deferred-publisher";
import { SessionStateStore } from "./state/session-state-store";

interface SetupOptions {
  env: (typeof env)["inferOut"];
}

type SetupFunction = (options: SetupOptions) => void;

export const setup = (({ env }) => {
  const dockerClient = new DockerClient();
  const sharedContainerNames = [
    env.BROWSER_CONTAINER_NAME,
    env.PROXY_CONTAINER_NAME,
  ];

  const workspaceUtilityContainer =
    dockerClient.createWorkspaceUtilityContainer(
      "lab_session_workspaces",
      "/workspaces"
    );

  const sandbox = new Sandbox(dockerClient, {
    network: new DockerNetworkManager(dockerClient),
    workspace: new DockerWorkspaceManager(
      dockerClient,
      {
        workspacesVolume: "lab_session_workspaces",
        workspacesMount: "/workspaces",
      },
      workspaceUtilityContainer
    ),
    runtime: new DockerRuntimeManager(dockerClient, {
      workspacesSource: "lab_session_workspaces",
      workspacesTarget: "/workspaces",
      opencodeAuthSource: "lab_opencode_auth",
      opencodeAuthTarget: "/root/.local/share/opencode",
      browserSocketSource: "lab_browser_sockets",
      browserSocketTarget: "/tmp/agent-browser-socket",
    }),
    session: new DockerSessionManager(dockerClient, {
      sharedContainerNames,
    }),
  });

  if (!(env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_CREDENTIALS)) {
    throw new Error(
      "At least one of ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_CREDENTIALS must be set"
    );
  }

  const acpUrl = env.SANDBOX_AGENT_URL;
  const acp = createAcpClient(acpUrl);

  const redis = new RedisClient(env.REDIS_URL);
  const sessionStateStore = new SessionStateStore();
  const proxyManager = new ProxyManager(env.PROXY_BASE_URL, redis);

  const deferredPublisher = new DeferredPublisher();

  const browserService = new BrowserServiceManager(
    {
      apiUrl: env.BROWSER_API_URL,
      wsUrl: env.BROWSER_WS_URL,
      containerScheme: env.CONTAINER_SCHEME,
      cleanupDelayMs: env.BROWSER_CLEANUP_DELAY_MS,
      reconcileIntervalMs: env.RECONCILE_INTERVAL_MS,
      maxRetries: env.MAX_DAEMON_RETRIES,
      proxyInternalUrl: env.PROXY_INTERNAL_URL,
      proxyBaseUrl: env.PROXY_BASE_URL,
    },
    deferredPublisher
  );

  const promptService = createDefaultPromptService();

  const sessionLifecycle = new SessionLifecycleManager({
    sandbox,
    proxyManager,
    browserServiceManager: browserService,
    deferredPublisher,
    sessionStateStore,
    acp,
    promptService,
    mcpUrl: env.SANDBOX_AGENT_MCP_URL,
  });

  const logMonitor = new LogMonitor(sandbox, deferredPublisher);
  const containerMonitor = new ContainerMonitor(sandbox, deferredPublisher);
  const acpMonitor = new AcpMonitor(acp, deferredPublisher, sessionStateStore);

  const imageStore = createImageStoreFromEnv();

  const poolManager = new PoolManager(
    env.POOL_SIZE,
    browserService,
    sessionLifecycle
  );

  const trustedOrigins = env.FRONTEND_URL ? [env.FRONTEND_URL] : [];
  const auth = createAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    githubClientId: env.AUTH_GITHUB_CLIENT_ID,
    githubClientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
    trustedOrigins,
  });

  const server = new ApiServer(
    {
      proxyBaseUrl: env.PROXY_BASE_URL,
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      frontendUrl: env.FRONTEND_URL,
      auth,
      mcpUrl: env.SANDBOX_AGENT_MCP_URL,
    },
    {
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      sandbox,
      acp,
      promptService,
      acpMonitor,
      imageStore,
      widelog,
      sessionStateStore,
    }
  );

  return {
    server,
    redis,
    deferredPublisher,
    browserService,
    sessionLifecycle,
    poolManager,
    logMonitor,
    containerMonitor,
    acpMonitor,
    networkReconcileMonitor: new NetworkReconcileMonitor(sandbox, [
      env.BROWSER_CONTAINER_NAME,
      env.PROXY_CONTAINER_NAME,
    ]),
  };
}) satisfies SetupFunction;
