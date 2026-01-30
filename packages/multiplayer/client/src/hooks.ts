import { useEffect, useCallback, useContext, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import type { ChannelConfig, SnapshotOf } from "@lab/multiplayer-shared";
import { resolvePath, hasParams } from "@lab/multiplayer-shared";
import type { ConnectionManager } from "./connection";
import { connectionStateAtom, channelStateFamily, type ChannelState } from "./atoms";
import { MultiplayerContext } from "./provider";
import type { z } from "zod";

type AnyChannelConfig = {
  path: string;
  snapshot: z.ZodType;
  default: unknown;
  delta?: z.ZodType;
  event?: z.ZodType;
};

type ChannelName<TChannels> = keyof TChannels & string;

type PathOf<C> = C extends { path: infer P } ? P : string;

type HasSessionParam<Path extends string> = Path extends `${string}{${string}}${string}`
  ? true
  : false;

type ChannelParams<TChannels, K extends ChannelName<TChannels>> =
  HasSessionParam<PathOf<TChannels[K]> & string> extends true ? { uuid: string } : undefined;

function toStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

export function createHooks<
  TChannels extends Record<string, AnyChannelConfig>,
  TClientMessages extends z.ZodType,
>(schema: { channels: TChannels; clientMessages: TClientMessages }) {
  type Channels = TChannels;
  type ClientMessage = z.infer<TClientMessages>;

  function useConnection(): ConnectionManager {
    const context = useContext(MultiplayerContext);
    if (!context) {
      throw new Error("useConnection must be used within MultiplayerProvider");
    }
    return context.connection;
  }

  function useMultiplayer() {
    const connection = useConnection();

    const send = useCallback(
      (sessionId: string, message: ClientMessage) => {
        connection.sendMessage({ sessionId, ...message });
      },
      [connection],
    );

    const connectionState = useAtomValue(connectionStateAtom);

    function useChannel<K extends ChannelName<Channels>>(
      channelName: K,
      ...args: ChannelParams<Channels, K> extends undefined
        ? []
        : [params: ChannelParams<Channels, K>]
    ): SnapshotOf<Channels[K]> {
      const channel = schema.channels[channelName];
      if (!channel) {
        throw new Error(`Unknown channel: ${channelName}`);
      }
      const params = args[0] ?? {};

      const resolvedPath = useMemo(() => {
        if (hasParams(channel.path)) {
          return resolvePath(channel.path, toStringRecord(params));
        }
        return channel.path;
      }, [channel.path, params]);

      const stateAtom = useMemo(() => channelStateFamily(resolvedPath), [resolvedPath]);
      const [state, setState] = useAtom(stateAtom);

      useEffect(() => {
        setState({ status: "connecting" });

        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          if (message.type === "snapshot") {
            setState({ status: "connected", data: message.data });
          } else if (message.type === "delta") {
            setState((prev: ChannelState<unknown>) => {
              if (prev.status !== "connected") return prev;
              return {
                status: "connected",
                data: applyDelta(prev.data, message.data, channel),
              };
            });
          } else if (message.type === "error") {
            setState({ status: "error", error: message.error });
          }
        });

        return () => {
          unsubscribe();
        };
      }, [resolvedPath, setState]);

      if (state.status === "connected") {
        return channel.snapshot.parse(state.data);
      }
      return channel.default;
    }

    type EventOf<C> = C extends { event: infer E }
      ? E extends z.ZodType
        ? z.infer<E>
        : never
      : never;

    function useChannelEvent<K extends ChannelName<Channels>>(
      channelName: K,
      callback: (event: EventOf<Channels[K]>) => void,
      ...args: ChannelParams<Channels, K> extends undefined
        ? []
        : [params: ChannelParams<Channels, K>]
    ): void {
      const channel = schema.channels[channelName];
      if (!channel) {
        throw new Error(`Unknown channel: ${channelName}`);
      }
      const params = args[0] ?? {};

      if (!channel.event) {
        throw new Error(`Channel "${channelName}" does not have events`);
      }

      const eventSchema = channel.event;

      const resolvedPath = useMemo(() => {
        if (hasParams(channel.path)) {
          return resolvePath(channel.path, toStringRecord(params));
        }
        return channel.path;
      }, [channel.path, params]);

      useEffect(() => {
        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          if (message.type === "event") {
            const parsed = eventSchema.parse(message.data);
            callback(parsed);
          }
        });

        return () => {
          unsubscribe();
        };
      }, [resolvedPath, callback, eventSchema]);
    }

    return {
      send,
      connectionState,
      useChannel,
      useChannelEvent,
    };
  }

  return {
    useMultiplayer,
  };
}

type DeltaType = "add" | "update" | "remove" | "append";
type IdentifiableItem = Record<string, unknown> & { id?: unknown; path?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdentifiable(value: unknown): value is IdentifiableItem {
  return isObject(value) && ("id" in value || "path" in value);
}

function getKey(item: IdentifiableItem): unknown {
  return item.id ?? item.path;
}

function extractItem(delta: Record<string, unknown>): IdentifiableItem | undefined {
  for (const [key, value] of Object.entries(delta)) {
    if (key !== "type" && isIdentifiable(value)) return value;
  }
}

function applyArrayDelta(array: unknown[], delta: Record<string, unknown>): unknown[] {
  const type = delta.type as DeltaType;
  const item = extractItem(delta);

  switch (type) {
    case "append":
      return "message" in delta ? [...array, delta.message] : array;

    case "add":
      return item ? [...array, item] : array;

    case "remove": {
      if (!item) return array;
      const key = getKey(item);
      return array.filter((el) => !isIdentifiable(el) || getKey(el) !== key);
    }

    case "update": {
      if (!item) return array;
      const key = getKey(item);
      return array.map((el) =>
        isIdentifiable(el) && getKey(el) === key ? { ...el, ...item } : el,
      );
    }

    default:
      return array;
  }
}

function applyDelta(current: unknown, delta: unknown, channel: ChannelConfig): unknown {
  if (!channel.delta || !isObject(delta)) return current;

  if (Array.isArray(current)) {
    return applyArrayDelta(current, delta);
  }

  if (isObject(current)) {
    return { ...current, ...delta };
  }

  return current;
}
