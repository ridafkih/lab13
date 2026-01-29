"use client";

import { useState, useCallback, useEffect } from "react";
import type { Container, CreateContainerInput } from "@lab/client";
import { useApiClient } from "../client";

interface UseContainersResult {
  containers: Container[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useContainers(projectId: string): UseContainersResult {
  const client = useApiClient();
  const [containers, setContainers] = useState<Container[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.containers.list(projectId);
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch containers"));
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { containers, isLoading, error, refetch };
}

interface UseCreateContainerResult {
  createContainer: (input: CreateContainerInput) => Promise<Container>;
  isLoading: boolean;
  error: Error | null;
}

export function useCreateContainer(projectId: string): UseCreateContainerResult {
  const client = useApiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createContainer = useCallback(
    async (input: CreateContainerInput): Promise<Container> => {
      setIsLoading(true);
      setError(null);
      try {
        const container = await client.containers.create(projectId, input);
        return container;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to create container");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [client, projectId],
  );

  return { createContainer, isLoading, error };
}
