"use client";

import type { Session } from "@lab/client";
import { useMultiplayer } from "./multiplayer";
import { useInferenceStatus } from "./use-inference-status";

export type SessionStatus = "starting" | "running" | "generating" | "error" | "deleting";

type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

export function useSessionStatus(
  session: Session,
  options?: { subscribeToEvents?: boolean },
): SessionStatus {
  const { subscribeToEvents = false } = options ?? {};
  const { useChannel } = useMultiplayer();
  const containers: SessionContainer[] = useChannel("sessionContainers", { uuid: session.id });
  const inferenceStatus = useInferenceStatus(session.opencodeSessionId, subscribeToEvents);

  // Priority:
  // 1. If session.status === "deleting" → "deleting"
  if ((session.status as string) === "deleting") {
    return "deleting";
  }

  // 2. If any container is "starting" → "starting"
  const hasStartingContainer = containers.some((container) => container.status === "starting");
  if (hasStartingContainer || session.status === "creating") {
    return "starting";
  }

  // 3. If any container is "error" → "error"
  const hasErrorContainer = containers.some((container) => container.status === "error");
  if (hasErrorContainer) {
    return "error";
  }

  // 4. If inferenceStatus === "generating" → "generating"
  if (inferenceStatus === "generating") {
    return "generating";
  }

  // 5. Otherwise → "running"
  return "running";
}
