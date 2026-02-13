import type {
  WireClientMessage,
  WireServerMessage,
} from "@lab/multiplayer-sdk";
import { config } from "../config/environment";
import { widelog } from "../logging";
import type { SessionMessage } from "../types/messages";

type MessageListener = (message: SessionMessage) => void;

interface SessionCompleteEvent {
  sessionId: string;
  completedAt: number;
}

type SessionCompleteListener = (event: SessionCompleteEvent) => void;

function isSessionCompleteEvent(value: unknown): value is SessionCompleteEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string") {
    return false;
  }
  if (!("completedAt" in value) || typeof value.completedAt !== "number") {
    return false;
  }
  return true;
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }
  if (
    !("role" in value) ||
    (value.role !== "user" && value.role !== "assistant")
  ) {
    return false;
  }
  if (!("content" in value) || typeof value.content !== "string") {
    return false;
  }
  if (!("timestamp" in value) || typeof value.timestamp !== "number") {
    return false;
  }
  if (!("senderId" in value) || typeof value.senderId !== "string") {
    return false;
  }
  return true;
}

function isSessionCompleteChannel(channel: string): boolean {
  return channel.startsWith("session/") && channel.endsWith("/complete");
}

function isServerMessage(value: unknown): value is WireServerMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("type" in value)) {
    return false;
  }

  const valueRecord = Object.fromEntries(Object.entries(value));
  const type = valueRecord.type;

  if (type === "pong") {
    return true;
  }
  const channel = valueRecord.channel;
  if (channel === undefined) {
    return false;
  }
  if (typeof channel !== "string") {
    return false;
  }

  switch (type) {
    case "snapshot":
    case "delta":
    case "event":
      return true;
    case "error": {
      const errorMessage = valueRecord.error;
      return typeof errorMessage === "string";
    }
    default:
      return false;
  }
}

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly subscriptions = new Map<string, Set<MessageListener>>();
  private readonly sessionCompleteSubscriptions = new Map<
    string,
    Set<SessionCompleteListener>
  >();
  private messageQueue: WireClientMessage[] = [];
  private reconnectAttempt = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;

  constructor(url: string = config.apiWsUrl) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    widelog.context(() => {
      widelog.set("event_name", "multiplayer.connect_attempt");
      widelog.set("url", this.url);
      widelog.set("attempt", this.reconnectAttempt);

      try {
        this.ws = new WebSocket(this.url);
        this.ws.addEventListener("open", this.handleOpen.bind(this));
        this.ws.addEventListener("close", this.handleClose.bind(this));
        this.ws.addEventListener("error", this.handleError.bind(this));
        this.ws.addEventListener("message", this.handleMessage.bind(this));
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.set(
          "error_message",
          error instanceof Error ? error.message : String(error)
        );
        this.isConnecting = false;
        this.scheduleReconnect();
      }

      widelog.flush();
    });
  }

  disconnect(): void {
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribeToSession(sessionId: string, listener: MessageListener): () => void {
    const channel = `session/${sessionId}/messages`;

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.send({ type: "subscribe", channel });
    }

    this.subscriptions.get(channel)?.add(listener);

    return () => {
      const listeners = this.subscriptions.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.subscriptions.delete(channel);
          this.send({ type: "unsubscribe", channel });
        }
      }
    };
  }

  subscribeToSessionComplete(
    sessionId: string,
    listener: SessionCompleteListener
  ): () => void {
    const channel = `session/${sessionId}/complete`;

    if (!this.sessionCompleteSubscriptions.has(channel)) {
      this.sessionCompleteSubscriptions.set(channel, new Set());
      this.send({ type: "subscribe", channel });
    }

    this.sessionCompleteSubscriptions.get(channel)?.add(listener);

    return () => {
      const listeners = this.sessionCompleteSubscriptions.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.sessionCompleteSubscriptions.delete(channel);
          this.send({ type: "unsubscribe", channel });
        }
      }
    };
  }

  private send(message: WireClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  private handleOpen(): void {
    widelog.context(() => {
      widelog.set("event_name", "multiplayer.connected");

      this.isConnecting = false;
      this.reconnectAttempt = 0;
      this.flushQueue();
      this.resubscribeAll();
      this.startHeartbeat();

      widelog.flush();
    });
  }

  private handleClose(): void {
    widelog.context(() => {
      widelog.set("event_name", "multiplayer.disconnected");

      this.isConnecting = false;
      this.clearHeartbeat();
      this.ws = null;
      this.scheduleReconnect();

      widelog.flush();
    });
  }

  private handleError(): void {
    widelog.context(() => {
      widelog.set("event_name", "multiplayer.websocket_error");
      widelog.set("url", this.url);
      widelog.set("attempt", this.reconnectAttempt);
      widelog.set("active_subscriptions", this.subscriptions.size);
      widelog.set("queued_messages", this.messageQueue.length);
      widelog.set("outcome", "error");
      widelog.flush();
    });
  }

  private parseChannelEvent(
    raw: unknown
  ): { channel: string; data: unknown } | null {
    if (!isServerMessage(raw)) {
      return null;
    }
    if (raw.type !== "event") {
      return null;
    }
    if (!("channel" in raw) || typeof raw.channel !== "string") {
      return null;
    }
    if (!("data" in raw)) {
      return null;
    }
    return { channel: raw.channel, data: raw.data };
  }

  private dispatchChannelEvent(channel: string, data: unknown): void {
    if (isSessionCompleteChannel(channel) && isSessionCompleteEvent(data)) {
      const listeners = this.sessionCompleteSubscriptions.get(channel);
      if (listeners) {
        for (const listener of listeners) {
          listener(data);
        }
      }
      return;
    }

    const listeners = this.subscriptions.get(channel);
    if (listeners && isSessionMessage(data)) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }

  private handleMessage(event: MessageEvent): void {
    widelog.context(() => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        const channelEvent = this.parseChannelEvent(parsed);
        if (channelEvent) {
          this.dispatchChannelEvent(channelEvent.channel, channelEvent.data);
        }
      } catch (error) {
        widelog.set("event_name", "multiplayer.malformed_message");
        widelog.set("outcome", "error");
        widelog.set(
          "error_message",
          error instanceof Error ? error.message : String(error)
        );
        widelog.flush();
      }
    });
  }

  private flushQueue(): void {
    const queue = this.messageQueue;
    this.messageQueue = [];
    for (const message of queue) {
      this.send(message);
    }
  }

  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      this.send({ type: "subscribe", channel });
    }

    for (const channel of this.sessionCompleteSubscriptions.keys()) {
      this.send({ type: "subscribe", channel });
    }
  }

  private scheduleReconnect(): void {
    widelog.context(() => {
      widelog.set("event_name", "multiplayer.reconnect_scheduled");

      if (this.reconnectAttempt >= this.maxReconnectAttempts) {
        widelog.set("outcome", "max_attempts_reached");
        widelog.set("max_attempts", this.maxReconnectAttempts);
        widelog.flush();
        return;
      }

      this.reconnectAttempt++;
      const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), 30_000);
      widelog.set("delay_ms", delay);
      widelog.set("attempt", this.reconnectAttempt);

      this.reconnectTimeout = setTimeout(() => this.connect(), delay);

      widelog.flush();
    });
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

export const multiplayerClient = new MultiplayerClient();
