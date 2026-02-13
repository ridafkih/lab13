"use client";

import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { getAgentApiUrl, useAcpSession } from "./acp-session";

type FileStatus = "added" | "modified" | "deleted";

export interface ChangedFile {
  path: string;
  status: FileStatus;
  added: number;
  removed: number;
}

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
  const apiUrl = getAgentApiUrl();
  const response = await fetch(
    `${apiUrl}/acp/files/status?sessionId=${encodeURIComponent(sessionId)}`,
    {
      headers: { "X-Lab-Session-Id": sessionId },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data.map(
      (file: {
        path: string;
        status: FileStatus;
        added: number;
        removed: number;
      }) => ({
        path: normalizePath(file.path),
        status: file.status,
        added: file.added,
        removed: file.removed,
      })
    );
  }

  return [];
}

function getFileStatusesKey(sessionId: string | null): string | null {
  if (!sessionId || sessionId === "new") {
    return null;
  }
  return `file-statuses-${sessionId}`;
}

export function useFileStatuses(sessionId: string | null) {
  const { subscribe } = useAcpSession();
  const { mutate } = useSWRConfig();

  const { data, error, isLoading } = useSWR<ChangedFile[]>(
    getFileStatusesKey(sessionId),
    () => {
      if (!sessionId) {
        return [];
      }
      return fetchFileStatuses(sessionId);
    }
  );

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const handleEvent = (event: { type: string }) => {
      if (
        event.type === "file.watcher.updated" ||
        event.type === "file.edited"
      ) {
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
