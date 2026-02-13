import type { NewSessionRequest } from "acp-http-client";
import type { AcpClient } from "../acp/client";
import { initiateAgentSession } from "../orchestration/conversation-initiator";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import { initializeSessionContainers } from "../runtime/containers";
import {
  cleanupOrphanedNetworks,
  cleanupSessionNetwork,
} from "../runtime/network";
import type { ProxyManager } from "../services/proxy.service";
import { SessionCleanupService } from "../services/session-cleanup.service";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import type { SessionStateStore } from "../state/session-state-store";
import type { Sandbox } from "../types/dependencies";
import type { PromptService } from "../types/prompt";
import type { BrowserServiceManager } from "./browser-service.manager";

interface SessionLifecycleManagerOptions {
  sandbox: Sandbox;
  proxyManager: ProxyManager;
  browserServiceManager: BrowserServiceManager;
  deferredPublisher: DeferredPublisher;
  sessionStateStore: SessionStateStore;
  acp: AcpClient;
  promptService: PromptService;
  mcpUrl?: string;
}

export class SessionLifecycleManager {
  private readonly initializationTasks = new Map<string, Promise<void>>();

  private readonly sandbox: Sandbox;
  private readonly proxyManager: ProxyManager;
  private readonly browserServiceManager: BrowserServiceManager;
  private readonly deferredPublisher: DeferredPublisher;
  private readonly sessionStateStore: SessionStateStore;
  private readonly acp: AcpClient;
  private readonly promptService: PromptService;
  private readonly mcpUrl?: string;

  constructor(options: SessionLifecycleManagerOptions) {
    this.sandbox = options.sandbox;
    this.proxyManager = options.proxyManager;
    this.browserServiceManager = options.browserServiceManager;
    this.deferredPublisher = options.deferredPublisher;
    this.sessionStateStore = options.sessionStateStore;
    this.acp = options.acp;
    this.promptService = options.promptService;
    this.mcpUrl = options.mcpUrl;
  }

  private getDeps() {
    const cleanupService = new SessionCleanupService({
      sandbox: this.sandbox,
      publisher: this.deferredPublisher.get(),
      proxyManager: this.proxyManager,
      sessionStateStore: this.sessionStateStore,
      sidecarProviders: [],
      cleanupSessionNetwork: (sessionId: string) =>
        cleanupSessionNetwork(sessionId, this.sandbox),
    });

    return {
      sandbox: this.sandbox,
      publisher: this.deferredPublisher.get(),
      proxyManager: this.proxyManager,
      cleanupService,
    };
  }

  async initialize(): Promise<void> {
    await cleanupOrphanedNetworks(this.sandbox);
  }

  async initializeSession(sessionId: string, projectId: string): Promise<void> {
    await initializeSessionContainers(
      sessionId,
      projectId,
      this.browserServiceManager.service,
      this.getDeps()
    );

    const systemPrompt = await this.buildSystemPrompt(sessionId, projectId);
    const mcpServers = this.buildMcpServers(sessionId);

    await initiateAgentSession({
      sessionId,
      acp: this.acp,
      systemPrompt: systemPrompt ?? undefined,
      mcpServers,
    });
  }

  scheduleInitializeSession(
    sessionId: string,
    projectId: string
  ): Promise<void> {
    const existing = this.initializationTasks.get(sessionId);
    if (existing) {
      return existing;
    }

    const task = this.initializeSession(sessionId, projectId).finally(() => {
      this.initializationTasks.delete(sessionId);
    });

    this.initializationTasks.set(sessionId, task);
    return task;
  }

  hasPendingInitialization(sessionId: string): boolean {
    return this.initializationTasks.has(sessionId);
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const { cleanupService } = this.getDeps();
    await cleanupService.cleanupSessionFull(
      sessionId,
      this.browserServiceManager.service
    );
  }

  private async buildSystemPrompt(
    sessionId: string,
    projectId: string
  ): Promise<string | null> {
    const projectPrompt = await getProjectSystemPrompt(projectId).catch(
      () => null
    );
    if (projectPrompt === null) {
      return null;
    }
    const { text } = this.promptService.compose({
      sessionId,
      projectId,
      projectSystemPrompt: projectPrompt,
    });
    return text || null;
  }

  private buildMcpServers(sessionId: string): NewSessionRequest["mcpServers"] {
    if (!this.mcpUrl) {
      return [];
    }
    return [
      {
        name: "lab",
        type: "http",
        url: this.mcpUrl,
        headers: [{ name: "x-lab-session-id", value: sessionId }],
      },
    ];
  }
}
