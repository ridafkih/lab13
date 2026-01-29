import type { Server } from "bun";
import type {
  Schema,
  ChannelConfig,
  ParamsFromPath,
  SnapshotOf,
  DeltaOf,
  EventOf,
  WireServerMessage,
} from "@lab/multiplayer-shared";
import { resolvePath, hasParams } from "@lab/multiplayer-shared";

type ChannelName<S extends Schema> = keyof S["channels"] & string;

type ChannelParams<S extends Schema, K extends ChannelName<S>> = ParamsFromPath<
  S["channels"][K]["path"]
>;

type HasDelta<C extends ChannelConfig> = C["delta"] extends undefined ? false : true;
type HasEvent<C extends ChannelConfig> = C["event"] extends undefined ? false : true;

export interface Publisher<S extends Schema> {
  publishSnapshot<K extends ChannelName<S>>(
    channelName: K,
    ...args: keyof ChannelParams<S, K> extends never
      ? [data: SnapshotOf<S["channels"][K]>]
      : [params: ChannelParams<S, K>, data: SnapshotOf<S["channels"][K]>]
  ): void;

  publishDelta<K extends ChannelName<S>>(
    channelName: K,
    ...args: HasDelta<S["channels"][K]> extends false
      ? never
      : keyof ChannelParams<S, K> extends never
        ? [data: DeltaOf<S["channels"][K]>]
        : [params: ChannelParams<S, K>, data: DeltaOf<S["channels"][K]>]
  ): void;

  publishEvent<K extends ChannelName<S>>(
    channelName: K,
    ...args: HasEvent<S["channels"][K]> extends false
      ? never
      : keyof ChannelParams<S, K> extends never
        ? [data: EventOf<S["channels"][K]>]
        : [params: ChannelParams<S, K>, data: EventOf<S["channels"][K]>]
  ): void;
}

interface ExtractedArgs {
  params: Record<string, string> | undefined;
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  for (const key in value) {
    if (typeof value[key] !== "string") return false;
  }
  return true;
}

function extractArgs(channelPath: string, args: unknown[]): ExtractedArgs {
  if (hasParams(channelPath)) {
    if (args.length < 2) {
      throw new Error(`Expected params and data for parameterized channel`);
    }
    const params = args[0];
    if (!isStringRecord(params)) {
      throw new Error(`Expected params to be an object with string values`);
    }
    return {
      params,
      data: args[1],
    };
  }
  if (args.length < 1) {
    throw new Error(`Expected data for channel`);
  }
  return {
    params: undefined,
    data: args[0],
  };
}

export function createPublisher<S extends Schema>(
  schema: S,
  getServer: () => Server<unknown>,
): Publisher<S> {
  function getResolvedPath(
    channelPath: string,
    params: Record<string, string> | undefined,
  ): string {
    if (hasParams(channelPath) && params) {
      return resolvePath(channelPath, params);
    }
    return channelPath;
  }

  function publish(channel: string, message: WireServerMessage): void {
    const server = getServer();
    server.publish(channel, JSON.stringify(message));
  }

  function getChannel(channelName: string) {
    const channel = schema.channels[channelName];
    if (!channel) {
      throw new Error(`Unknown channel: ${channelName}`);
    }
    return channel;
  }

  const publisher: Publisher<S> = {
    publishSnapshot(channelName, ...args) {
      const channel = getChannel(channelName);
      const { params, data } = extractArgs(channel.path, args);
      const resolvedPath = getResolvedPath(channel.path, params);
      publish(resolvedPath, { type: "snapshot", channel: resolvedPath, data });
    },

    publishDelta(channelName, ...args) {
      const channel = getChannel(channelName);
      const { params, data } = extractArgs(channel.path, args);
      const resolvedPath = getResolvedPath(channel.path, params);
      publish(resolvedPath, { type: "delta", channel: resolvedPath, data });
    },

    publishEvent(channelName, ...args) {
      const channel = getChannel(channelName);
      const { params, data } = extractArgs(channel.path, args);
      const resolvedPath = getResolvedPath(channel.path, params);
      publish(resolvedPath, { type: "event", channel: resolvedPath, data });
    },
  };

  return publisher;
}
