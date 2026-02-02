import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import type { ConnectionState } from "./connection";

export type ChannelState<T> =
  | { status: "connecting" }
  | { status: "reconnecting"; data: T }
  | { status: "connected"; data: T }
  | { status: "error"; error: string }
  | { status: "disconnected" };

export const connectionStateAtom = atom<ConnectionState>({
  status: "disconnected",
});

export const channelStateFamily = atomFamily((_channel: string) =>
  atom<ChannelState<unknown>>({ status: "connecting" }),
);
