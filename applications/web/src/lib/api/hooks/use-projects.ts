"use client";

import { useState, useCallback, useEffect } from "react";
import type { Project, CreateProjectInput } from "@lab/client";
import { useApiClient } from "../client";

interface UseProjectsResult {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const client = useApiClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.projects.list();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch projects"));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { projects, isLoading, error, refetch };
}

interface UseCreateProjectResult {
  createProject: (input: CreateProjectInput) => Promise<Project>;
  isLoading: boolean;
  error: Error | null;
}

export function useCreateProject(): UseCreateProjectResult {
  const client = useApiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<Project> => {
      setIsLoading(true);
      setError(null);
      try {
        const project = await client.projects.create(input);
        return project;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to create project");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  return { createProject, isLoading, error };
}
