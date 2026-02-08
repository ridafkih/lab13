"use client";

import type { Session } from "@lab/client";
import { useMultiplayer } from "./multiplayer";

export type SessionStatus = "starting" | "running" | "generating" | "error" | "deleting";

type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

export function useSessionStatus(session: Session | null): SessionStatus {
  const { useChannel } = useMultiplayer();
  const sessionChannelParams = session ? { uuid: session.id } : undefined;
  const channelOptions = { enabled: Boolean(session?.id) };

  const containers: SessionContainer[] = useChannel(
    "sessionContainers",
    sessionChannelParams,
    channelOptions,
  );
  const metadata = useChannel("sessionMetadata", sessionChannelParams, channelOptions);

  if (!session) {
    return "starting";
  }

  if ((session.status as string) === "deleting") {
    return "deleting";
  }

  const hasStartingContainer = containers.some((container) => container.status === "starting");
  if (hasStartingContainer || session.status === "creating") {
    return "starting";
  }

  const hasErrorContainer = containers.some((container) => container.status === "error");
  if (hasErrorContainer) {
    return "error";
  }

  if (metadata.inferenceStatus === "generating") {
    return "generating";
  }

  return "running";
}
