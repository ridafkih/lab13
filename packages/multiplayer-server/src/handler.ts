import type { Server, ServerWebSocket } from "bun";
import type {
  Schema,
  ChannelConfig,
  WireClientMessage,
  WireServerMessage,
  SnapshotOf,
  ClientMessageOf,
} from "@lab/multiplayer-sdk";
import { parsePath } from "@lab/multiplayer-sdk";

function hasType(value: object): value is { type: unknown } {
  return "type" in value;
}

function hasChannel(value: object): value is { channel: unknown } {
  return "channel" in value;
}

function hasData(value: object): value is { data: unknown } {
  return "data" in value;
}

function isWireClientMessage(value: unknown): value is WireClientMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!hasType(value)) return false;

  const { type } = value;

  if (type === "ping") return true;

  if (type === "message") {
    return hasData(value);
  }

  if (!hasChannel(value)) return false;
  if (typeof value.channel !== "string") return false;

  switch (type) {
    case "subscribe":
    case "unsubscribe":
      return true;
    default:
      return false;
  }
}

export interface WebSocketData<TAuth = unknown> {
  auth: TAuth;
  subscriptions: Set<string>;
}

export interface ChannelContext<TAuth, TParams> {
  auth: TAuth;
  params: TParams;
  ws: ServerWebSocket<WebSocketData<TAuth>>;
}

type AnyParams = Record<string, string>;

export type ChannelHandlers<TChannel extends ChannelConfig, TAuth> = {
  authorize?: (context: ChannelContext<TAuth, AnyParams>) => boolean | Promise<boolean>;

  getSnapshot: (
    context: ChannelContext<TAuth, AnyParams>,
  ) => SnapshotOf<TChannel> | Promise<SnapshotOf<TChannel>>;

  onSubscribe?: (context: ChannelContext<TAuth, AnyParams>) => void | Promise<void>;
  onUnsubscribe?: (context: ChannelContext<TAuth, AnyParams>) => void | Promise<void>;
};

export type SchemaHandlers<S extends Schema, TAuth> = {
  [K in keyof S["channels"]]?: ChannelHandlers<S["channels"][K], TAuth>;
};

export interface MessageContext<TAuth> {
  auth: TAuth;
  ws: ServerWebSocket<WebSocketData<TAuth>>;
}

export interface HandlerOptions<S extends Schema, TAuth> {
  authenticate: (token: string | null) => TAuth | Promise<TAuth>;
  onMessage?: (context: MessageContext<TAuth>, message: ClientMessageOf<S>) => void | Promise<void>;
}

export function createWebSocketHandler<S extends Schema, TAuth>(
  schema: S,
  handlers: SchemaHandlers<S, TAuth>,
  options: HandlerOptions<S, TAuth>,
) {
  type WS = ServerWebSocket<WebSocketData<TAuth>>;

  type HandlerName = keyof typeof handlers & string;

  function isHandlerName(name: string): name is HandlerName {
    return name in handlers;
  }

  function findChannelMatch(
    resolvedPath: string,
  ): { name: HandlerName; config: ChannelConfig; params: Record<string, string> } | null {
    for (const [name, config] of Object.entries(schema.channels)) {
      const params = parsePath(config.path, resolvedPath);
      if (params !== null && isHandlerName(name)) {
        return { name, config, params };
      }
    }
    return null;
  }

  async function handleSubscribe(ws: WS, channel: string): Promise<void> {
    // Skip if already subscribed
    if (ws.data.subscriptions.has(channel)) {
      return;
    }

    const match = findChannelMatch(channel);
    if (!match) {
      sendMessage(ws, { type: "error", channel, error: "Unknown channel" });
      return;
    }

    const handler = handlers[match.name];
    if (!handler) {
      sendMessage(ws, { type: "error", channel, error: "No handler for channel" });
      return;
    }

    const context: ChannelContext<TAuth, Record<string, string>> = {
      auth: ws.data.auth,
      params: match.params,
      ws,
    };

    if (handler.authorize) {
      const authorized = await handler.authorize(context);
      if (!authorized) {
        sendMessage(ws, { type: "error", channel, error: "Unauthorized" });
        return;
      }
    }

    ws.data.subscriptions.add(channel);
    ws.subscribe(channel);

    try {
      const snapshot = await handler.getSnapshot(context);
      sendMessage(ws, { type: "snapshot", channel, data: snapshot });

      if (handler.onSubscribe) {
        await handler.onSubscribe(context);
      }
    } catch (err) {
      sendMessage(ws, {
        type: "error",
        channel,
        error: err instanceof Error ? err.message : "Failed to get snapshot",
      });
    }
  }

  async function handleUnsubscribe(ws: WS, channel: string): Promise<void> {
    const match = findChannelMatch(channel);
    if (match) {
      const handler = handlers[match.name];
      if (handler?.onUnsubscribe) {
        const context: ChannelContext<TAuth, Record<string, string>> = {
          auth: ws.data.auth,
          params: match.params,
          ws,
        };
        try {
          await handler.onUnsubscribe(context);
        } catch (err) {
          console.warn("Error in onUnsubscribe handler:", err);
        }
      }
    }
    ws.data.subscriptions.delete(channel);
    ws.unsubscribe(channel);
  }

  async function handleMessage(ws: WS, data: unknown): Promise<void> {
    if (!options.onMessage) return;

    const parseResult = schema.clientMessages.safeParse(data);
    if (!parseResult.success) return;

    const context: MessageContext<TAuth> = {
      auth: ws.data.auth,
      ws,
    };

    try {
      await options.onMessage(context, parseResult.data);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  function sendMessage(ws: WS, message: WireServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  const websocketHandler = {
    async message(ws: WS, message: string | Buffer) {
      try {
        const raw: unknown = JSON.parse(typeof message === "string" ? message : message.toString());

        if (!isWireClientMessage(raw)) {
          return;
        }

        switch (raw.type) {
          case "subscribe":
            await handleSubscribe(ws, raw.channel);
            break;
          case "unsubscribe":
            await handleUnsubscribe(ws, raw.channel);
            break;
          case "message":
            await handleMessage(ws, raw.data);
            break;
          case "ping":
            sendMessage(ws, { type: "pong" });
            break;
        }
      } catch (error) {
        console.warn("Malformed WebSocket message:", error);
      }
    },

    close(ws: WS) {
      for (const channel of ws.data.subscriptions) {
        const match = findChannelMatch(channel);
        if (match) {
          const handler = handlers[match.name];
          if (handler?.onUnsubscribe) {
            const context: ChannelContext<TAuth, Record<string, string>> = {
              auth: ws.data.auth,
              params: match.params,
              ws,
            };
            Promise.resolve(handler.onUnsubscribe(context)).catch((err: unknown) => {
              console.warn("Error in onUnsubscribe handler during close:", err);
            });
          }
        }
        ws.unsubscribe(channel);
      }
      ws.data.subscriptions.clear();
    },
  };

  async function upgrade(
    req: Request,
    server: Server<WebSocketData<TAuth>>,
  ): Promise<Response | undefined> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    let auth: TAuth;
    try {
      auth = await options.authenticate(token);
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const success = server.upgrade(req, {
      data: {
        auth,
        subscriptions: new Set<string>(),
      },
    });

    if (success) {
      return undefined;
    }

    return new Response("Upgrade failed", { status: 500 });
  }

  return { websocketHandler, upgrade };
}
