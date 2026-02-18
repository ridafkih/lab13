import type { ImageStore } from "@lab/context";
import type { AcpClient } from "../acp/client";
import type { BrowserServiceManager } from "../managers/browser-service.manager";
import type { PoolManager } from "../managers/pool.manager";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import type { AcpMonitor } from "../monitors/acp.monitor";
import type { LogMonitor } from "../monitors/log.monitor";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher, Sandbox } from "./dependencies";
import type { PromptService } from "./prompt";

export interface BrowserContext {
  browserService: BrowserServiceManager;
  imageStore?: ImageStore;
}

export interface SessionContext {
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
}

export interface InfraContext {
  sandbox: Sandbox;
  acp: AcpClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

export interface MonitorContext {
  logMonitor: LogMonitor;
  acpMonitor: AcpMonitor;
}

export interface GithubContext {
  githubClientId?: string;
  githubClientSecret?: string;
  githubCallbackUrl?: string;
  frontendUrl?: string;
}

export interface ProxyContext {
  proxyBaseUrl: string;
}

export interface PromptContext {
  promptService?: PromptService;
}

export interface AuthContext {
  auth: import("../auth").Auth;
}
