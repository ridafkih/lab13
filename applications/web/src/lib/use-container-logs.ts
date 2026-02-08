"use client";

import { useReducer, useRef } from "react";
import { useMultiplayer } from "./multiplayer";

type LogSource = {
  id: string;
  hostname: string;
  runtimeId: string;
  status: "streaming" | "stopped" | "error";
};

type LogEntry = {
  containerId: string;
  stream: "stdout" | "stderr";
  text: string;
  timestamp: number;
};

type SessionLogsSnapshot = {
  sources: LogSource[];
  recentLogs: Record<string, LogEntry[]>;
};

type LogsState = {
  logs: Record<string, LogEntry[]>;
};

type LogsAction =
  | { type: "initialize"; logs: Record<string, LogEntry[]> }
  | { type: "add"; entry: LogEntry }
  | { type: "clear"; containerId?: string };

const MAX_LOGS_PER_CONTAINER = 1000;

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

  const snapshot = useChannel("sessionLogs", { uuid: sessionId }) as SessionLogsSnapshot;

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
    { uuid: sessionId },
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
