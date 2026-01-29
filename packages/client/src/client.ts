import type {
  Project,
  CreateProjectInput,
  Container,
  CreateContainerInput,
  Session,
  AgentStatus,
  Model,
} from "./types";

export interface ClientConfig {
  baseUrl: string;
}

export function createClient(config: ClientConfig) {
  const { baseUrl } = config;

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  return {
    projects: {
      list: () => request<Project[]>("/projects"),

      get: (projectId: string) => request<Project>(`/projects/${projectId}`),

      create: (input: CreateProjectInput) =>
        request<Project>("/projects", {
          method: "POST",
          body: JSON.stringify(input),
        }),

      delete: (projectId: string) =>
        request<void>(`/projects/${projectId}`, {
          method: "DELETE",
        }),
    },

    containers: {
      list: (projectId: string) => request<Container[]>(`/projects/${projectId}/containers`),

      create: (projectId: string, input: CreateContainerInput) =>
        request<Container>(`/projects/${projectId}/containers`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
    },

    sessions: {
      list: (projectId: string) => request<Session[]>(`/projects/${projectId}/sessions`),

      create: (projectId: string) =>
        request<Session>(`/projects/${projectId}/sessions`, {
          method: "POST",
        }),
    },

    agent: {
      status: (sessionId: string) => request<AgentStatus>(`/sessions/${sessionId}/agent`),

      start: (sessionId: string) =>
        request<{ started: boolean }>(`/sessions/${sessionId}/agent`, {
          method: "POST",
        }),

      sendMessage: (
        sessionId: string,
        message: string,
        model?: { providerId: string; modelId: string },
      ) =>
        request<{ accepted: boolean }>(`/sessions/${sessionId}/agent/message`, {
          method: "POST",
          body: JSON.stringify({ message, model }),
        }),

      stop: (sessionId: string) =>
        request<void>(`/sessions/${sessionId}/agent`, {
          method: "DELETE",
        }),
    },

    models: {
      list: () => request<{ models: Model[] }>("/models"),
    },
  };
}

export type Client = ReturnType<typeof createClient>;
