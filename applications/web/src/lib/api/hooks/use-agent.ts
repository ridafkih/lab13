"use client";

import { useState, useCallback, useEffect } from "react";
import { useApiClient } from "../client";

export type AgentState =
  | { status: "loading" }
  | { status: "inactive" }
  | { status: "active"; isProcessing: boolean };

interface UseAgentResult {
  state: AgentState;
  isSending: boolean;
  error: Error | null;
  start: () => Promise<void>;
  sendMessage: (content: string, model?: { providerId: string; modelId: string }) => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
  setProcessingComplete: () => void;
}

export function useAgent(sessionId: string): UseAgentResult {
  const client = useApiClient();
  const [state, setState] = useState<AgentState>({ status: "loading" });
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    client.agent.status(sessionId).then((response) => {
      if (cancelled) return;
      setState(response);
    });

    return () => {
      cancelled = true;
    };
  }, [client, sessionId]);

  const start = useCallback(async () => {
    setError(null);
    try {
      await client.agent.start(sessionId);
      setState({ status: "active", isProcessing: false });
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to start agent");
      setError(error);
      throw error;
    }
  }, [client, sessionId]);

  const sendMessage = useCallback(
    async (content: string, model?: { providerId: string; modelId: string }) => {
      setError(null);
      setIsSending(true);
      try {
        if (state.status !== "active") {
          await client.agent.start(sessionId);
        }

        await client.agent.sendMessage(sessionId, content, model);
        setState({ status: "active", isProcessing: true });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to send message");
        if (error.message.includes("currently processing")) {
          setError(new Error("Agent is processing. Please wait."));
        } else {
          setError(error);
        }
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [client, sessionId, state.status],
  );

  const stop = useCallback(async () => {
    setError(null);
    try {
      await client.agent.stop(sessionId);
      setState({ status: "inactive" });
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to stop agent");
      setError(error);
      throw error;
    }
  }, [client, sessionId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setProcessingComplete = useCallback(() => {
    setState((prev) => {
      if (prev.status === "active") {
        return { status: "active", isProcessing: false };
      }
      return prev;
    });
  }, []);

  return {
    state,
    isSending,
    error,
    start,
    sendMessage,
    stop,
    clearError,
    setProcessingComplete,
  };
}
