import type { Server } from "bun";
import type {
  Schema,
  ChannelName,
  PathOf,
  HasParams,
  DataOf,
  WireServerMessage,
} from "@lab/multiplayer-sdk";
import { resolvePath, hasParams } from "@lab/multiplayer-sdk";

type ParamsArg<Path extends string> = HasParams<Path> extends true ? { uuid: string } : undefined;

export interface Publisher<S extends Schema> {
  publishSnapshot<K extends ChannelName<S>>(
    channelName: K,
    ...args: ParamsArg<PathOf<S["channels"][K]>> extends undefined
      ? [data: DataOf<S["channels"][K], "snapshot">]
      : [params: ParamsArg<PathOf<S["channels"][K]>>, data: DataOf<S["channels"][K], "snapshot">]
  ): void;

  publishDelta<K extends ChannelName<S>>(
    channelName: K,
    ...args: ParamsArg<PathOf<S["channels"][K]>> extends undefined
      ? [data: DataOf<S["channels"][K], "delta">]
      : [params: ParamsArg<PathOf<S["channels"][K]>>, data: DataOf<S["channels"][K], "delta">]
  ): void;

  publishEvent<K extends ChannelName<S>>(
    channelName: K,
    ...args: ParamsArg<PathOf<S["channels"][K]>> extends undefined
      ? [data: DataOf<S["channels"][K], "event">]
      : [params: ParamsArg<PathOf<S["channels"][K]>>, data: DataOf<S["channels"][K], "event">]
  ): void;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const key in value) {
    if (typeof (value as Record<string, unknown>)[key] !== "string") return false;
  }
  return true;
}

function extractArgs(
  channelPath: string,
  args: unknown[],
): {
  params: Record<string, string> | undefined;
  data: unknown;
} {
  if (hasParams(channelPath)) {
    const params = args[0];
    if (!isStringRecord(params)) {
      throw new Error(`Expected params to be an object with string values`);
    }
    return { params, data: args[1] };
  }
  return { params: undefined, data: args[0] };
}

export function createPublisher<S extends Schema>(
  schema: S,
  getServer: () => Server<unknown>,
): Publisher<S> {
  function publish(channel: string, message: WireServerMessage): void {
    getServer().publish(channel, JSON.stringify(message));
  }

  return {
    publishSnapshot(channelName, ...args) {
      const channel = schema.channels[channelName];
      const { params, data } = extractArgs(channel.path, args);
      const path = params ? resolvePath(channel.path, params) : channel.path;
      publish(path, { type: "snapshot", channel: path, data });
    },

    publishDelta(channelName, ...args) {
      const channel = schema.channels[channelName];
      const { params, data } = extractArgs(channel.path, args);
      const path = params ? resolvePath(channel.path, params) : channel.path;
      publish(path, { type: "delta", channel: path, data });
    },

    publishEvent(channelName, ...args) {
      const channel = schema.channels[channelName];
      const { params, data } = extractArgs(channel.path, args);
      const path = params ? resolvePath(channel.path, params) : channel.path;
      publish(path, { type: "event", channel: path, data });
    },
  };
}
