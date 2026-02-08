"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { useMultiplayer } from "./multiplayer";
import type { Session } from "@lab/client";

interface MultiplayerSession {
  id: string;
  projectId: string;
  title: string | null;
}

function toSession(multiplayerSession: MultiplayerSession): Session {
  return {
    id: multiplayerSession.id,
    projectId: multiplayerSession.projectId,
    title: multiplayerSession.title,
    opencodeSessionId: null,
    status: "idle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function useSessionsSync() {
  const { mutate } = useSWRConfig();
  const { useChannel } = useMultiplayer();
  const previousIdsRef = useRef<Set<string>>(new Set());

  const sessions = useChannel("sessions");

  useEffect(() => {
    const currentIds = new Set(sessions.map((session) => session.id));
    const previousIds = previousIdsRef.current;

    const added = sessions.filter((session) => !previousIds.has(session.id));
    const removedIds = [...previousIds].filter((id) => !currentIds.has(id));

    previousIdsRef.current = currentIds;

    if (added.length === 0 && removedIds.length === 0) return;

    const addedByProject = new Map<string, Session[]>();
    for (const session of added) {
      const existing = addedByProject.get(session.projectId) ?? [];
      existing.push(toSession(session));
      addedByProject.set(session.projectId, existing);
    }

    for (const [projectId, newSessions] of addedByProject) {
      mutate(
        `sessions-${projectId}`,
        (current: Session[] | undefined) => {
          if (!current) return newSessions;
          const existingIds = new Set(current.map((session) => session.id));
          const toAdd = newSessions.filter((session) => !existingIds.has(session.id));
          if (toAdd.length === 0) return current;
          return [...current, ...toAdd];
        },
        false,
      );
    }

    if (removedIds.length > 0) {
      const removedSet = new Set(removedIds);
      mutate(
        (key) => typeof key === "string" && key.startsWith("sessions-"),
        (current: Session[] | undefined) => {
          if (!current) return current;
          const filtered = current.filter((session) => !removedSet.has(session.id));
          if (filtered.length === current.length) return current;
          return filtered;
        },
        false,
      );
    }
  }, [sessions, mutate]);
}
