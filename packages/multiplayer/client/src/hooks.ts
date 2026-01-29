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
    const ctx = useContext(MultiplayerContext);
    if (!ctx) {
      throw new Error("useConnection must be used within MultiplayerProvider");
    }
    return ctx.connection;
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

    function useChannelEvent<K extends ChannelName<Channels>>(
      channelName: K,
      callback: (
        event: Channels[K] extends { event: z.ZodType } ? z.infer<Channels[K]["event"]> : never,
      ) => void,
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

interface DeltaObject {
  type?: string;
  project?: unknown;
  file?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

interface ItemWithId {
  id: unknown;
  [key: string]: unknown;
}

function isDeltaObject(value: unknown): value is DeltaObject {
  return typeof value === "object" && value !== null;
}

function isItemWithId(value: unknown): value is ItemWithId {
  return typeof value === "object" && value !== null && "id" in value;
}

function getItem(d: DeltaObject): unknown {
  return d.project ?? d.file ?? d.message;
}

function applyDelta(current: unknown, delta: unknown, channel: ChannelConfig): unknown {
  if (!channel.delta) return current;

  if (Array.isArray(current) && isDeltaObject(delta)) {
    if (delta.type === "append" && "message" in delta) {
      return [...current, delta.message];
    }

    if (delta.type === "add") {
      const item = getItem(delta);
      if (item) {
        return [...current, item];
      }
    }

    if (delta.type === "remove") {
      const item = getItem(delta);
      if (isItemWithId(item)) {
        return current.filter((c: unknown) => !isItemWithId(c) || c.id !== item.id);
      }
    }

    if (delta.type === "update") {
      const item = getItem(delta);
      if (isItemWithId(item)) {
        return current.map((c: unknown) =>
          isItemWithId(c) && c.id === item.id ? { ...c, ...item } : c,
        );
      }
    }
  }

  if (typeof current === "object" && current !== null && isDeltaObject(delta)) {
    return { ...current, ...delta };
  }

  return current;
}
