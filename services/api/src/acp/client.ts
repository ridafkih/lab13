import {
  AcpHttpClient,
  type AcpHttpClientOptions,
  type AnyMessage,
  type NewSessionRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "acp-http-client";
import type { AcpEvent } from "../types/dependencies";

type EventListener = (envelope: AnyMessage) => void;

interface CreateSessionOptions {
  cwd?: string;
  mcpServers?: NewSessionRequest["mcpServers"];
  model?: string;
  systemPrompt?: string;
}

function buildSessionInit(options: CreateSessionOptions): NewSessionRequest {
  const init: NewSessionRequest = {
    cwd: options.cwd ?? "/",
    mcpServers: options.mcpServers ?? [],
  };

  const meta: Record<string, unknown> = {};
  if (options.model) {
    meta.model = options.model;
  }
  if (options.systemPrompt) {
    meta.appendSystemPrompt = options.systemPrompt;
  }
  init._meta = {
    disableBuiltInTools: true,
    ...(Object.keys(meta).length > 0 ? { "sandboxagent.dev": meta } : {}),
  };

  return init;
}

function autoApprovePermission(request: RequestPermissionRequest): {
  outcome: RequestPermissionResponse["outcome"];
} {
  const options = request.options ?? [];
  const allow =
    options.find((o) => o.kind === "allow_always") ??
    options.find((o) => o.kind === "allow_once");
  if (allow) {
    return { outcome: { outcome: "selected", optionId: allow.optionId } };
  }
  return { outcome: { outcome: "cancelled" } };
}

export class AgentSessionManager {
  private readonly baseUrl: string;
  private readonly clients = new Map<string, AcpHttpClient>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly eventBuffers = new Map<string, AnyMessage[]>();
  private readonly sessionIds = new Map<string, string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createSession(
    serverId: string,
    options: CreateSessionOptions
  ): Promise<string> {
    const listeners = new Set<EventListener>();
    this.listeners.set(serverId, listeners);

    const buffer: AnyMessage[] = [];
    this.eventBuffers.set(serverId, buffer);

    const emit = (envelope: AnyMessage) => {
      if (listeners.size === 0) {
        buffer.push(envelope);
      } else {
        for (const listener of listeners) {
          listener(envelope);
        }
      }
    };

    const clientOptions: AcpHttpClientOptions = {
      baseUrl: this.baseUrl,
      transport: {
        path: `/v1/acp/${serverId}`,
        bootstrapQuery: { agent: "claude", permissionMode: "bypass" },
      },
      client: {
        requestPermission: (request) =>
          Promise.resolve(autoApprovePermission(request)),
        sessionUpdate: (notification: SessionNotification) => {
          const envelope: AnyMessage = {
            jsonrpc: "2.0",
            method: "session/update",
            params: notification,
          };
          emit(envelope);
          return Promise.resolve();
        },
      },
    };

    const client = new AcpHttpClient(clientOptions);
    this.clients.set(serverId, client);

    await client.initialize();

    const sessionInit = buildSessionInit(options);
    const result = await client.newSession(sessionInit);
    this.sessionIds.set(serverId, result.sessionId);

    return result.sessionId;
  }

  async sendMessage(serverId: string, text: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No session for server: ${serverId}`);
    }

    const sessionId = this.sessionIds.get(serverId);
    if (!sessionId) {
      throw new Error(`No session ID for server: ${serverId}`);
    }

    // Always emit a user_message event so it flows through SSE, gets
    // stored in the DB, and survives page reloads. The frontend does
    // NOT add user messages optimistically — this is the single source.
    const userEnvelope: AnyMessage = {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "user_message",
          content: { type: "text", text },
        },
      },
    };

    const listeners = this.listeners.get(serverId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        listener(userEnvelope);
      }
    } else {
      const buffer = this.eventBuffers.get(serverId);
      if (buffer) {
        buffer.push(userEnvelope);
      }
    }

    await client.prompt({
      sessionId,
      prompt: [{ type: "text", text }],
    });

    // Emit synthetic result with stopReason so the frontend's
    // translateAcpEvent calls finishTurn() — this resets activeItemId
    // and emits turn.ended, preventing the next reply from appending
    // to the previous assistant message.
    const finishEnvelope: AnyMessage = {
      jsonrpc: "2.0",
      id: null,
      result: { stopReason: "end_turn" },
    };
    const currentListeners = this.listeners.get(serverId);
    if (currentListeners) {
      for (const listener of currentListeners) {
        listener(finishEnvelope);
      }
    }
  }

  async cancelPrompt(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No session for server: ${serverId}`);
    }

    const sessionId = this.sessionIds.get(serverId);
    if (!sessionId) {
      throw new Error(`No session ID for server: ${serverId}`);
    }

    await client.cancel({ sessionId });

    const finishEnvelope: AnyMessage = {
      jsonrpc: "2.0",
      id: null,
      result: { stopReason: "cancelled" },
    };
    const listeners = this.listeners.get(serverId);
    if (listeners) {
      for (const listener of listeners) {
        listener(finishEnvelope);
      }
    }
  }

  async destroySession(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
      this.listeners.delete(serverId);
      this.sessionIds.delete(serverId);
    }
  }

  onSessionEvent(serverId: string, callback: EventListener): () => void {
    let listenerSet = this.listeners.get(serverId);
    if (!listenerSet) {
      listenerSet = new Set();
      this.listeners.set(serverId, listenerSet);
    }
    listenerSet.add(callback);

    const buffer = this.eventBuffers.get(serverId);
    if (buffer && buffer.length > 0) {
      const events = buffer.splice(0);
      for (const envelope of events) {
        callback(envelope);
      }
    }

    return () => listenerSet.delete(callback);
  }

  emitEvent(serverId: string, envelope: AnyMessage): void {
    const listeners = this.listeners.get(serverId);
    if (listeners) {
      for (const listener of listeners) {
        listener(envelope);
      }
    }
  }

  async listAgents(): Promise<{ agents: Record<string, unknown>[] }> {
    const response = await fetch(`${this.baseUrl}/v1/agents`);
    return response.json();
  }

  async getAgent(
    id: string,
    opts?: { config?: boolean }
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}/v1/agents/${id}`);
    if (opts?.config) {
      url.searchParams.set("config", "true");
    }
    const response = await fetch(url);
    return response.json();
  }

  async listFsEntries(query: {
    path?: string;
  }): Promise<{ name: string; path: string; entryType: string }[]> {
    const url = new URL(`${this.baseUrl}/v1/fs/entries`);
    if (query.path) {
      url.searchParams.set("path", query.path);
    }
    const response = await fetch(url);
    return response.json();
  }

  async readFsFile(query: { path: string }): Promise<Uint8Array> {
    const url = new URL(`${this.baseUrl}/v1/fs/file`);
    url.searchParams.set("path", query.path);
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export type AcpClient = AgentSessionManager;

export function createAcpClient(baseUrl: string): AcpClient {
  return new AgentSessionManager(baseUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasMessageMethod(envelope: AnyMessage): envelope is AnyMessage & {
  method: string;
  params: unknown;
  id?: string | number | null;
} {
  return "method" in envelope && "params" in envelope;
}

export function envelopeToSandboxEvent(
  envelope: AnyMessage,
  sequence = 0
): AcpEvent | null {
  if (!hasMessageMethod(envelope)) {
    return null;
  }

  const method = envelope.method;
  const params = envelope.params;

  if (typeof method !== "string" || !isRecord(params)) {
    return null;
  }

  const data: Record<string, unknown> = { ...params };
  if ("id" in envelope && envelope.id !== undefined) {
    data._rpcId = envelope.id;
  }

  return {
    type: method,
    sequence,
    data,
  };
}
