import type { z } from "zod";

export interface ChannelConfig<
  TPath extends string = string,
  TSnapshot extends z.ZodType = z.ZodType,
  TDelta extends z.ZodType | undefined = z.ZodType | undefined,
  TEvent extends z.ZodType | undefined = z.ZodType | undefined,
> {
  path: TPath;
  snapshot: TSnapshot;
  default: z.infer<TSnapshot>;
  delta?: TDelta;
  event?: TEvent;
}

export interface Schema<
  TChannels extends Record<string, ChannelConfig> = Record<string, ChannelConfig>,
  TClientMessages extends z.ZodType = z.ZodType,
> {
  channels: TChannels;
  clientMessages: TClientMessages;
}

export type SnapshotOf<T extends ChannelConfig> = z.infer<T["snapshot"]>;

export type DeltaOf<T extends ChannelConfig> = T["delta"] extends z.ZodType
  ? z.infer<T["delta"]>
  : never;

export type EventOf<T extends ChannelConfig> = T["event"] extends z.ZodType
  ? z.infer<T["event"]>
  : never;

export type ClientMessageOf<S extends Schema> = z.infer<S["clientMessages"]>;

export type WireClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "message"; data: unknown }
  | { type: "ping" };

export type WireServerMessage =
  | { type: "snapshot"; channel: string; data: unknown }
  | { type: "delta"; channel: string; data: unknown }
  | { type: "event"; channel: string; data: unknown }
  | { type: "error"; channel: string; error: string }
  | { type: "pong" };

export type ChannelName<S extends Schema> = keyof S["channels"] & string;

export type PathOf<C extends ChannelConfig> = C["path"];

export type HasParams<Path extends string> = Path extends `${string}:${string}` ? true : false;

export type ParamsFor<Path extends string> =
  HasParams<Path> extends true ? { uuid: string } : undefined;

export type DataOf<C, Key extends "snapshot" | "delta" | "event"> = C extends {
  [K in Key]?: infer T;
}
  ? T extends z.ZodType
    ? z.infer<T>
    : never
  : never;
