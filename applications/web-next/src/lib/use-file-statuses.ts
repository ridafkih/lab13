"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { useOpenCodeSession } from "./opencode-session";

type FileStatus = "added" | "modified" | "deleted";

type ChangedFile = {
  path: string;
  status: FileStatus;
  added: number;
  removed: number;
};

interface CachedFileStatuses {
  files: ChangedFile[];
  timestamp: number;
}

const CACHE_TTL = 30 * 1000;
const fileStatusCache = new Map<string, CachedFileStatuses>();
const pendingPrefetches = new Map<string, Promise<ChangedFile[]>>();

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

function createSessionClient(sessionId: string) {
  return createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": sessionId },
  });
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

async function fetchFileStatusesFromApi(sessionId: string): Promise<ChangedFile[]> {
  const client = createSessionClient(sessionId);

  try {
    const response = await client.file.status({
      query: {},
    });

    if (response.data) {
      return response.data.map((file) => ({
        path: normalizePath(file.path),
        status: file.status,
        added: file.added,
        removed: file.removed,
      }));
    }
  } catch (error) {
    console.error("Failed to fetch file statuses:", error);
  }

  return [];
}

export async function prefetchFileStatuses(sessionId: string): Promise<void> {
  const cached = fileStatusCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
  if (pendingPrefetches.has(sessionId)) return;

  const prefetchPromise = (async (): Promise<ChangedFile[]> => {
    try {
      const files = await fetchFileStatusesFromApi(sessionId);
      fileStatusCache.set(sessionId, { files, timestamp: Date.now() });
      return files;
    } catch {
      return [];
    } finally {
      pendingPrefetches.delete(sessionId);
    }
  })();

  pendingPrefetches.set(sessionId, prefetchPromise);
}

export function invalidateFileStatusCache(sessionId: string): void {
  fileStatusCache.delete(sessionId);
  pendingPrefetches.delete(sessionId);
}

export function useFileStatuses(sessionId: string | null): ChangedFile[] {
  const { subscribe } = useOpenCodeSession();
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);

  const client = useMemo(() => {
    if (!sessionId) return null;
    return createSessionClient(sessionId);
  }, [sessionId]);

  const fetchFileStatuses = useCallback(async () => {
    if (!client || !sessionId) return;

    try {
      const response = await client.file.status({
        query: {},
      });

      if (response.data) {
        const files: ChangedFile[] = response.data.map((file) => ({
          path: normalizePath(file.path),
          status: file.status,
          added: file.added,
          removed: file.removed,
        }));
        setChangedFiles(files);
        fileStatusCache.set(sessionId, { files, timestamp: Date.now() });
      }
    } catch (error) {
      console.error("Failed to fetch file statuses:", error);
    }
  }, [client, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setChangedFiles([]);
      return;
    }

    const cached = fileStatusCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setChangedFiles(cached.files);
      return;
    }

    const pending = pendingPrefetches.get(sessionId);
    if (pending) {
      pending.then((files) => setChangedFiles(files));
      return;
    }

    fetchFileStatuses();
  }, [sessionId, fetchFileStatuses]);

  useEffect(() => {
    const handleEvent = (event: { type: string }) => {
      if (event.type === "file.watcher.updated" || event.type === "file.edited") {
        fetchFileStatuses();
      }
    };

    return subscribe(handleEvent);
  }, [subscribe, fetchFileStatuses]);

  return changedFiles;
}
