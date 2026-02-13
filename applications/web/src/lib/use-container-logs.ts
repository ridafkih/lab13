"use client";

import { useReducer, useRef } from "react";
import { useMultiplayer } from "./multiplayer";

interface LogSource {
  id: string;
  hostname: string;
  runtimeId: string;
  status: "streaming" | "stopped" | "error";
}

interface LogEntry {
  containerId: string;
  stream: "stdout" | "stderr";
  text: string;
  timestamp: number;
}

interface SessionLogsSnapshot {
  sources: LogSource[];
  recentLogs: Record<string, LogEntry[]>;
}

interface LogsState {
  logs: Record<string, LogEntry[]>;
}

type LogsAction =
  | { type: "initialize"; logs: Record<string, LogEntry[]> }
  | { type: "add"; entry: LogEntry }
  | { type: "clear"; containerId?: string };

const MAX_LOGS_PER_CONTAINER = 1000;

function isLogSource(value: unknown): value is LogSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = Object.fromEntries(Object.entries(value));
  return (
    typeof record.id === "string" &&
    typeof record.hostname === "string" &&
    typeof record.runtimeId === "string" &&
    (record.status === "streaming" ||
      record.status === "stopped" ||
      record.status === "error")
  );
}

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = Object.fromEntries(Object.entries(value));
  return (
    typeof record.containerId === "string" &&
    (record.stream === "stdout" || record.stream === "stderr") &&
    typeof record.text === "string" &&
    typeof record.timestamp === "number"
  );
}

function normalizeSnapshot(snapshot: unknown): SessionLogsSnapshot {
  if (typeof snapshot !== "object" || snapshot === null) {
    return { sources: [], recentLogs: {} };
  }

  const record = Object.fromEntries(Object.entries(snapshot));
  const sources = Array.isArray(record.sources)
    ? record.sources.filter(isLogSource)
    : [];

  const recentLogs: Record<string, LogEntry[]> = {};
  if (typeof record.recentLogs === "object" && record.recentLogs !== null) {
    const recentLogRecord = Object.fromEntries(
      Object.entries(record.recentLogs)
    );
    for (const [containerId, entries] of Object.entries(recentLogRecord)) {
      if (!Array.isArray(entries)) {
        continue;
      }
      recentLogs[containerId] = entries.filter(isLogEntry);
    }
  }

  return { sources, recentLogs };
}

function logsReducer(state: LogsState, action: LogsAction): LogsState {
  switch (action.type) {
    case "initialize":
      return { logs: action.logs };
    case "add": {
      const { entry } = action;
      const containerLogs = state.logs[entry.containerId] ?? [];
      const newLogs = [...containerLogs, entry];

      if (newLogs.length > MAX_LOGS_PER_CONTAINER) {
        newLogs.splice(0, newLogs.length - MAX_LOGS_PER_CONTAINER);
      }

      return {
        logs: {
          ...state.logs,
          [entry.containerId]: newLogs,
        },
      };
    }
    case "clear":
      if (action.containerId) {
        return {
          logs: {
            ...state.logs,
            [action.containerId]: [],
          },
        };
      }
      return { logs: {} };
    default:
      return state;
  }
}

export function useContainerLogs(sessionId: string) {
  const { useChannel, useChannelEvent } = useMultiplayer();

  const rawSnapshot = useChannel("sessionLogs", {
    uuid: sessionId,
  });
  const snapshot = normalizeSnapshot(rawSnapshot);

  const [state, dispatch] = useReducer(logsReducer, { logs: {} });
  const initializedRef = useRef(false);

  if (!initializedRef.current && snapshot.sources.length > 0) {
    initializedRef.current = true;
    dispatch({ type: "initialize", logs: snapshot.recentLogs });
  }

  useChannelEvent(
    "sessionLogs",
    (event: LogEntry) => {
      dispatch({ type: "add", entry: event });
    },
    { uuid: sessionId }
  );

  const clearLogs = (containerId?: string) => {
    dispatch({ type: "clear", containerId });
  };

  return {
    sources: snapshot.sources,
    logs: state.logs,
    clearLogs,
  };
}

export type { LogSource, LogEntry };
