import type { Server } from "bun";
import type { WireServerMessage } from "@lab/multiplayer-shared";
import { resolvePath, hasParams } from "@lab/multiplayer-shared";
import type { z } from "zod";

type AnyChannelConfig = {
  path: string;
  snapshot: z.ZodType;
  default: unknown;
  delta?: z.ZodType;
  event?: z.ZodType;
};

type AnySchema = {
  channels: Record<string, AnyChannelConfig>;
  clientMessages: z.ZodType;
};

type ChannelName<S extends AnySchema> = keyof S["channels"] & string;

type PathOf<C> = C extends { path: infer P extends string } ? P : string;

type HasParams<Path extends string> = Path extends `${string}{${string}}${string}` ? true : false;

type ParamsArg<Path extends string> = HasParams<Path> extends true ? { uuid: string } : undefined;

type DataOf<C, Key extends "snapshot" | "delta" | "event"> = C extends { [K in Key]?: infer T }
  ? T extends z.ZodType
    ? z.infer<T>
    : never
  : never;

export interface Publisher<S extends AnySchema> {
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

export function createPublisher<S extends AnySchema>(
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
