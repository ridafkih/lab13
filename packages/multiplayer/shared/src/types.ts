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
