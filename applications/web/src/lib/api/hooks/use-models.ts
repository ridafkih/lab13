"use client";

import { useState, useEffect } from "react";
import type { Model } from "@lab/client";
import { useApiClient } from "../client";

interface UseModelsResult {
  models: Model[];
  isLoading: boolean;
  error: Error | null;
}

export function useModels(): UseModelsResult {
  const client = useApiClient();
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchModels() {
      try {
        const response = await client.models.list();
        if (!cancelled) {
          setModels(response.models);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to fetch models"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchModels();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return { models, isLoading, error };
}
