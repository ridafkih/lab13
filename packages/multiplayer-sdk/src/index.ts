export { defineChannel, defineSchema } from "./schema";
export { resolvePath, parsePath, hasParams } from "./channel";
export { schema, type AppSchema, type ClientMessage } from "./channels";

export type {
  ChannelConfig,
  Schema,
  SnapshotOf,
  DeltaOf,
  EventOf,
  ClientMessageOf,
  WireClientMessage,
  WireServerMessage,
  ChannelName,
  PathOf,
  HasParams,
  ParamsFor,
  DataOf,
} from "./types";
