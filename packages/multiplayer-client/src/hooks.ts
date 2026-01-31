import { useEffect, useCallback, useContext, useMemo, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import type {
  ChannelConfig,
  Schema,
  SnapshotOf,
  ChannelName,
  PathOf,
  HasParams,
  EventOf,
  ClientMessageOf,
} from "@lab/multiplayer-sdk";
import { resolvePath, hasParams } from "@lab/multiplayer-sdk";
import type { ConnectionManager } from "./connection";
import { connectionStateAtom, channelStateFamily, type ChannelState } from "./atoms";
import { MultiplayerContext } from "./provider";

function parseSnapshot<C extends ChannelConfig>(channel: C, data: unknown): SnapshotOf<C> {
  return channel.snapshot.parse(data);
}

function parseEvent<C extends ChannelConfig>(channel: C, data: unknown): EventOf<C> {
  if (!channel.event) {
    throw new Error("Channel does not have events");
  }
  return channel.event.parse(data);
}

type ChannelParams<S extends Schema, K extends ChannelName<S>> =
  HasParams<PathOf<S["channels"][K]>> extends true ? { uuid: string } : undefined;

function toStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

export function createHooks<S extends Schema>(schema: S) {
  type ClientMessage = ClientMessageOf<S>;

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
        connection.sendMessage(Object.assign({ sessionId }, message));
      },
      [connection],
    );

    const connectionState = useAtomValue(connectionStateAtom);

    function useChannel<K extends ChannelName<S>>(
      channelName: K,
      ...args: ChannelParams<S, K> extends undefined ? [] : [params: ChannelParams<S, K>]
    ): SnapshotOf<S["channels"][K]> {
      const channel = schema.channels[channelName];
      if (!channel) throw new Error(`Unknown channel: ${channelName}`);

      const params = args[0] ?? {};
      const isInvalidParam = (value: unknown) =>
        value === "" || value == null || String(value).startsWith("temp-");
      const shouldSkip = hasParams(channel.path) && Object.values(params).some(isInvalidParam);

      const resolvedPath = useMemo(
        () =>
          hasParams(channel.path)
            ? resolvePath(channel.path, toStringRecord(params))
            : channel.path,
        [channel.path, params],
      );

      const stateAtom = useMemo(() => channelStateFamily(resolvedPath), [resolvedPath]);
      const [state, setState] = useAtom(stateAtom);

      useEffect(() => {
        if (shouldSkip) return;

        setState({ status: "connecting" });

        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          switch (message.type) {
            case "snapshot":
              setState({ status: "connected", data: message.data });
              break;
            case "delta":
              setState((prev: ChannelState<unknown>) =>
                prev.status === "connected"
                  ? { status: "connected", data: applyDelta(prev.data, message.data, channel) }
                  : prev,
              );
              break;
            case "error":
              setState({ status: "error", error: message.error });
              break;
          }
        });

        return unsubscribe;
      }, [channel, connection, resolvedPath, setState, shouldSkip]);

      if (shouldSkip || state.status !== "connected") return channel.default;
      return parseSnapshot(channel, state.data);
    }

    function useChannelEvent<K extends ChannelName<S>>(
      channelName: K,
      callback: (event: EventOf<S["channels"][K]>) => void,
      ...args: ChannelParams<S, K> extends undefined ? [] : [params: ChannelParams<S, K>]
    ): void {
      const channel = schema.channels[channelName];
      if (!channel) {
        throw new Error(`Unknown channel: ${channelName}`);
      }
      const params = args[0] ?? {};

      if (!channel.event) {
        throw new Error(`Channel "${channelName}" does not have events`);
      }

      const callbackRef = useRef(callback);
      callbackRef.current = callback;

      const resolvedPath = useMemo(() => {
        if (hasParams(channel.path)) {
          return resolvePath(channel.path, toStringRecord(params));
        }
        return channel.path;
      }, [channel.path, params]);

      useEffect(() => {
        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          if (message.type === "event") {
            const parsed = parseEvent(channel, message.data);
            callbackRef.current(parsed);
          }
        });

        return () => {
          unsubscribe();
        };
      }, [resolvedPath]);
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
      return array.filter((element) => !isIdentifiable(element) || getKey(element) !== key);
    }

    case "update": {
      if (!item) return array;
      const key = getKey(item);
      return array.map((element) =>
        isIdentifiable(element) && getKey(element) === key ? { ...element, ...item } : element,
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
