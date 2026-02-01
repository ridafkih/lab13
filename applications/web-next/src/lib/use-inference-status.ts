"use client";

import { useState, useEffect } from "react";
import { subscribeToSessionEvents, type Event } from "./opencode-events";

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
  labSessionId: string | null,
  opencodeSessionId: string | null,
): InferenceStatus {
  const [status, setStatus] = useState<InferenceStatus>("idle");

  useEffect(() => {
    if (!labSessionId || !opencodeSessionId) {
      setStatus("idle");
      return;
    }

    const abortController = new AbortController();

    const handleEvent = (event: Event): void => {
      const eventSessionId = getSessionIdFromEvent(event);
      if (eventSessionId !== opencodeSessionId) return;

      if (event.type === "message.updated" || event.type === "message.part.updated") {
        setStatus("generating");
      } else if (event.type === "session.idle") {
        setStatus("idle");
      }
    };

    subscribeToSessionEvents(labSessionId, handleEvent);

    return () => {
      abortController.abort();
    };
  }, [labSessionId, opencodeSessionId]);

  return status;
}
