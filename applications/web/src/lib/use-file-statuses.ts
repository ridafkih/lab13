"use client";

import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useOpenCodeSession } from "./opencode-session";
import { createSessionClient } from "./use-session-client";

type FileStatus = "added" | "modified" | "deleted";

export type ChangedFile = {
  path: string;
  status: FileStatus;
  added: number;
  removed: number;
};

function normalizePath(path: string): string {
  const segments = path.split("/");
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === "..") {
      result.pop();
    } else if (segment !== "." && segment !== "") {
      result.push(segment);
    }
  }

  return result.join("/");
}

async function fetchFileStatuses(sessionId: string): Promise<ChangedFile[]> {
  const client = createSessionClient(sessionId);
  const response = await client.file.status({});

  if (response.data) {
    return response.data.map((file) => ({
      path: normalizePath(file.path),
      status: file.status,
      added: file.added,
      removed: file.removed,
    }));
  }

  return [];
}

function getFileStatusesKey(sessionId: string | null): string | null {
  return sessionId ? `file-statuses-${sessionId}` : null;
}

export function useFileStatuses(sessionId: string | null) {
  const { subscribe } = useOpenCodeSession();
  const { mutate } = useSWRConfig();

  const { data, error, isLoading } = useSWR<ChangedFile[]>(getFileStatusesKey(sessionId), () =>
    fetchFileStatuses(sessionId!),
  );

  useEffect(() => {
    if (!sessionId) return;

    const handleEvent = (event: { type: string }) => {
      if (event.type === "file.watcher.updated" || event.type === "file.edited") {
        mutate(getFileStatusesKey(sessionId));
      }
    };

    return subscribe(handleEvent);
  }, [subscribe, mutate, sessionId]);

  return {
    files: data ?? [],
    error,
    isLoading,
  };
}
