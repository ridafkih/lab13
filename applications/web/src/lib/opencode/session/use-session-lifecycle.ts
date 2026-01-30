"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client";
import { useApiClient } from "../../api/client";

interface UseSessionLifecycleResult {
  opencodeSessionId: string | null;
  opencodeClient: OpencodeClient;
  isInitializing: boolean;
  error: Error | null;
}

export function useSessionLifecycle(labSessionId: string): UseSessionLifecycleResult {
  const apiClient = useApiClient();

  const opencodeClient = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      throw new Error("NEXT_PUBLIC_API_URL must be set");
    }

    return createOpencodeClient({
      baseUrl: `${apiUrl}/opencode`,
      headers: { "X-Lab-Session-Id": labSessionId },
    });
  }, [labSessionId]);

  const [_opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        const labSession = await apiClient.sessions.get(labSessionId);

        if (cancelled) return;

        if (labSession.opencodeSessionId) {
          sessionIdRef.current = labSession.opencodeSessionId;
          setOpencodeSessionId(labSession.opencodeSessionId);
        } else {
          const response = await opencodeClient.session.create({});

          if (cancelled) return;

          if (response.error || !response.data) {
            throw new Error(`Failed to create OpenCode session: ${JSON.stringify(response.error)}`);
          }

          sessionIdRef.current = response.data.id;
          setOpencodeSessionId(response.data.id);

          await apiClient.sessions.update(labSessionId, {
            opencodeSessionId: response.data.id,
          });
        }

        setIsInitializing(false);
      } catch (initError) {
        if (cancelled) return;

        setError(
          initError instanceof Error ? initError : new Error("Failed to initialize session"),
        );
        setIsInitializing(false);
      }
    };

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, [apiClient, labSessionId, opencodeClient]);

  return {
    opencodeSessionId: sessionIdRef.current,
    opencodeClient,
    isInitializing,
    error,
  };
}
