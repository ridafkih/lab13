"use client";

import { useState, useEffect } from "react";
import { api } from "./api";
import { useMultiplayer } from "./multiplayer";

type OrchestrationStatus =
  | "idle"
  | "pending"
  | "thinking"
  | "delegating"
  | "starting"
  | "complete"
  | "error";

interface OrchestrationState {
  status: OrchestrationStatus;
  projectName: string | null;
  sessionId: string | null;
  errorMessage: string | null;
  orchestrationId: string | null;
}

interface UseOrchestrateResult {
  state: OrchestrationState;
  submit: (content: string, options?: { channelId?: string; modelId?: string }) => Promise<void>;
  reset: () => void;
  isLoading: boolean;
}

const initialState: OrchestrationState = {
  status: "idle",
  projectName: null,
  sessionId: null,
  errorMessage: null,
  orchestrationId: null,
};

export function useOrchestrate(): UseOrchestrateResult {
  const { useChannel } = useMultiplayer();
  const [state, setState] = useState<OrchestrationState>(initialState);

  const orchestrationStatus = useChannel(
    "orchestrationStatus",
    state.orchestrationId ? { uuid: state.orchestrationId } : undefined,
    { enabled: Boolean(state.orchestrationId) },
  );

  const isLoading =
    state.status === "pending" ||
    state.status === "thinking" ||
    state.status === "delegating" ||
    state.status === "starting";

  useEffect(() => {
    if (!state.orchestrationId) return;

    setState((prev) => ({
      ...prev,
      status: orchestrationStatus.status,
      projectName: orchestrationStatus.projectName,
      sessionId: orchestrationStatus.sessionId,
      errorMessage: orchestrationStatus.errorMessage,
    }));
  }, [
    state.orchestrationId,
    orchestrationStatus.status,
    orchestrationStatus.projectName,
    orchestrationStatus.sessionId,
    orchestrationStatus.errorMessage,
  ]);

  const reset = () => {
    setState(initialState);
  };

  const submit = async (content: string, options?: { channelId?: string; modelId?: string }) => {
    reset();
    setState({
      status: "pending",
      projectName: null,
      sessionId: null,
      errorMessage: null,
      orchestrationId: null,
    });

    try {
      const result = await api.orchestrate({
        content,
        channelId: options?.channelId,
        modelId: options?.modelId,
      });

      setState((prev) => ({
        ...prev,
        orchestrationId: result.orchestrationId,
        projectName: result.projectName,
        sessionId: result.sessionId,
        status: result.sessionId ? "complete" : prev.status,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Orchestration failed";
      setState({
        status: "error",
        projectName: null,
        sessionId: null,
        errorMessage,
        orchestrationId: null,
      });
    }
  };

  return {
    state,
    submit,
    reset,
    isLoading,
  };
}
