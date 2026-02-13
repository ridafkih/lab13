import type {
  ChannelConfig,
  ChannelName,
  ClientMessageOf,
  EventOf,
  HasParams,
  PathOf,
  Schema,
  SnapshotOf,
} from "@lab/multiplayer-sdk";
import { hasParams, resolvePath } from "@lab/multiplayer-sdk";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  type ChannelState,
  channelStateFamily,
  connectionStateAtom,
} from "./atoms";
import type { ConnectionManager } from "./connection";
import { MultiplayerContext } from "./provider";

function parseSnapshot<C extends ChannelConfig>(
  channel: C,
  data: unknown
): SnapshotOf<C> {
  return channel.snapshot.parse(data);
}

function parseEvent<C extends ChannelConfig>(
  channel: C,
  data: unknown
): EventOf<C> {
  if (!channel.event) {
    throw new Error("Channel does not have events");
  }
  return channel.event.parse(data);
}

type ChannelParams<S extends Schema, K extends ChannelName<S>> =
  HasParams<PathOf<S["channels"][K]>> extends true
    ? { uuid: string }
    : undefined;

interface ChannelOptions {
  enabled?: boolean;
}

function toStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function normalizeParams(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
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
        connection.sendMessage({ sessionId, ...message });
      },
      [connection]
    );

    const connectionState = useAtomValue(connectionStateAtom);

    function useChannel<K extends ChannelName<S>>(
      channelName: K,
      params?: ChannelParams<S, K>,
      options?: ChannelOptions
    ): SnapshotOf<S["channels"][K]> {
      const channel = schema.channels[channelName];
      if (!channel) {
        throw new Error(`Unknown channel: ${channelName}`);
      }

      const resolvedParams = normalizeParams(params);
      const resolvedOptions = options ?? {};
      const isInvalidParam = (value: unknown) => value === "" || value == null;
      const hasInvalidParams =
        hasParams(channel.path) &&
        (Object.keys(resolvedParams).length === 0 ||
          Object.values(resolvedParams).some(isInvalidParam));
      const shouldSkip = hasInvalidParams || resolvedOptions.enabled === false;

      const resolvedPath = useMemo(
        () =>
          hasParams(channel.path)
            ? resolvePath(channel.path, toStringRecord(resolvedParams))
            : channel.path,
        [channel.path, resolvedParams]
      );

      const stateAtom = useMemo(
        () => channelStateFamily(resolvedPath),
        [resolvedPath]
      );
      const [state, setState] = useAtom(stateAtom);

      useEffect(() => {
        if (shouldSkip) {
          return;
        }

        const alreadySubscribed = connection.isSubscribed(resolvedPath);
        if (!alreadySubscribed) {
          setState((prev: ChannelState<unknown>) =>
            prev.status === "connected" || prev.status === "reconnecting"
              ? { status: "reconnecting", data: prev.data }
              : { status: "connecting" }
          );
        }

        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          switch (message.type) {
            case "snapshot":
              setState({ status: "connected", data: message.data });
              break;
            case "delta":
              setState((prev: ChannelState<unknown>) =>
                prev.status === "connected" || prev.status === "reconnecting"
                  ? {
                      status: "connected",
                      data: applyDelta(prev.data, message.data, channel),
                    }
                  : prev
              );
              break;
            case "error":
              setState({ status: "error", error: message.error });
              break;
            default:
              break;
          }
        });

        return unsubscribe;
      }, [channel, resolvedPath, setState, shouldSkip]);

      if (shouldSkip || state.status === "connecting") {
        return channel.default;
      }
      if (state.status === "reconnecting") {
        return parseSnapshot(channel, state.data);
      }
      if (state.status !== "connected") {
        return channel.default;
      }
      return parseSnapshot(channel, state.data);
    }

    function useChannelEvent<K extends ChannelName<S>>(
      channelName: K,
      callback: (event: EventOf<S["channels"][K]>) => void,
      ...args: ChannelParams<S, K> extends undefined
        ? [params?: undefined, options?: ChannelOptions]
        : [params: ChannelParams<S, K>, options?: ChannelOptions]
    ): void {
      const channel = schema.channels[channelName];
      if (!channel) {
        throw new Error(`Unknown channel: ${channelName}`);
      }
      const params = args[0] ?? {};
      const options = args[1] ?? {};

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

      const enabled = options.enabled !== false;

      useEffect(() => {
        if (!enabled) {
          return;
        }

        const unsubscribe = connection.subscribe(resolvedPath, (message) => {
          if (message.type === "event") {
            const parsed = parseEvent(channel, message.data);
            callbackRef.current(parsed);
          }
        });

        return unsubscribe;
      }, [resolvedPath, enabled, channel]);
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
type IdentifiableItem = Record<string, unknown> & {
  id?: unknown;
  path?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdentifiable(value: unknown): value is IdentifiableItem {
  return isObject(value) && ("id" in value || "path" in value);
}

function getKey(item: IdentifiableItem): unknown {
  return item.id ?? item.path;
}

function extractItem(
  delta: Record<string, unknown>
): IdentifiableItem | undefined {
  for (const [key, value] of Object.entries(delta)) {
    if (key !== "type" && isIdentifiable(value)) {
      return value;
    }
  }
}

function isDeltaType(value: unknown): value is DeltaType {
  return (
    value === "add" ||
    value === "update" ||
    value === "remove" ||
    value === "append"
  );
}

function applyArrayDelta(
  array: unknown[],
  delta: Record<string, unknown>
): unknown[] {
  const type = delta.type;
  if (!isDeltaType(type)) {
    return array;
  }
  const item = extractItem(delta);

  switch (type) {
    case "append":
      return "message" in delta ? [...array, delta.message] : array;

    case "add": {
      if (!item) {
        return array;
      }
      const key = getKey(item);
      const exists = array.some(
        (element) => isIdentifiable(element) && getKey(element) === key
      );
      return exists ? array : [...array, item];
    }

    case "remove": {
      if (!item) {
        return array;
      }
      const key = getKey(item);
      return array.filter(
        (element) => !isIdentifiable(element) || getKey(element) !== key
      );
    }

    case "update": {
      if (!item) {
        return array;
      }
      const key = getKey(item);
      return array.map((element) =>
        isIdentifiable(element) && getKey(element) === key
          ? { ...element, ...item }
          : element
      );
    }

    default:
      return array;
  }
}

function applyDelta(
  current: unknown,
  delta: unknown,
  channel: ChannelConfig
): unknown {
  if (!(channel.delta && isObject(delta))) {
    return current;
  }

  if (Array.isArray(current)) {
    return applyArrayDelta(current, delta);
  }

  if (isObject(current)) {
    return { ...current, ...delta };
  }

  return current;
}
