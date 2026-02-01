"use client";

import { useState, useEffect, useCallback } from "react";
import { useOpenCodeSession, type Event } from "./opencode-session";

type InferenceStatus = "generating" | "idle";

function getSessionIdFromEvent(event: Event): string | undefined {
  if (!("properties" in event)) return undefined;

  const properties = event.properties;

  if ("sessionID" in properties && typeof properties.sessionID === "string") {
    return properties.sessionID;
  }

  if ("info" in properties && typeof properties.info === "object" && properties.info !== null) {
    const info = properties.info;
    if ("sessionID" in info && typeof info.sessionID === "string") {
      return info.sessionID;
    }
  }

  if ("part" in properties && typeof properties.part === "object" && properties.part !== null) {
    const part = properties.part;
    if ("sessionID" in part && typeof part.sessionID === "string") {
      return part.sessionID;
    }
  }

  return undefined;
}

export function useInferenceStatus(
  opencodeSessionId: string | null,
  enabled: boolean = true,
): InferenceStatus {
  const { subscribe } = useOpenCodeSession();
  const [status, setStatus] = useState<InferenceStatus>("idle");

  const handleEvent = useCallback(
    (event: Event): void => {
      const eventSessionId = getSessionIdFromEvent(event);
      if (eventSessionId !== opencodeSessionId) return;

      if (event.type === "message.updated" || event.type === "message.part.updated") {
        setStatus("generating");
      } else if (event.type === "session.idle") {
        setStatus("idle");
      }
    },
    [opencodeSessionId],
  );

  useEffect(() => {
    if (!enabled || !opencodeSessionId) {
      setStatus("idle");
      return;
    }

    return subscribe(handleEvent);
  }, [enabled, opencodeSessionId, subscribe, handleEvent]);

  return status;
}
