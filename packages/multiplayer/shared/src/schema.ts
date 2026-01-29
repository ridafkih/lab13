import type { z } from "zod";

export function defineChannel<
  const TPath extends string,
  const TSnapshot extends z.ZodType,
  const TDefault extends z.infer<TSnapshot>,
  const TDelta extends z.ZodType = never,
  const TEvent extends z.ZodType = never,
>(config: { path: TPath; snapshot: TSnapshot; default: TDefault; delta?: TDelta; event?: TEvent }) {
  return config;
}

export function defineSchema<
  const TChannels extends Record<string, ReturnType<typeof defineChannel>>,
  const TClientMessages extends z.ZodType,
>(config: {
  channels: TChannels;
  clientMessages: TClientMessages;
}): {
  channels: TChannels;
  clientMessages: TClientMessages;
} {
  return config;
}
