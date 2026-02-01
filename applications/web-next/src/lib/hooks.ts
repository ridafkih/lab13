import useSWR, { useSWRConfig } from "swr";
import { atom, useAtom } from "jotai";
import { api } from "./api";
import type { Session } from "@lab/client";

interface CreationState {
  isCreating: boolean;
  projectId: string | null;
  sessionCountAtCreation: number;
}

const creationStateAtom = atom<CreationState>({
  isCreating: false,
  projectId: null,
  sessionCountAtCreation: 0,
});

export function useSessionCreation() {
  return useAtom(creationStateAtom);
}

export function useProjects() {
  return useSWR("projects", () => api.projects.list());
}

interface ModelGroup {
  provider: string;
  models: { label: string; value: string }[];
}

export function useModels() {
  return useSWR("models", async () => {
    const response = await api.models.list();

    const groupMap = new Map<string, ModelGroup>();
    for (const model of response.models) {
      const existing = groupMap.get(model.providerId);
      const entry = { label: model.name, value: `${model.providerId}/${model.modelId}` };

      if (existing) {
        existing.models.push(entry);
      } else {
        groupMap.set(model.providerId, {
          provider: model.providerName,
          models: [entry],
        });
      }
    }

    return Array.from(groupMap.values());
  });
}

export function useContainers(projectId: string | null) {
  return useSWR(projectId ? `containers-${projectId}` : null, () => {
    if (!projectId) return [];
    return api.containers.list(projectId);
  });
}

export function useSessions(projectId: string | null) {
  return useSWR(projectId ? `sessions-${projectId}` : null, () => {
    if (!projectId) return [];
    return api.sessions.list(projectId);
  });
}

export function useSession(sessionId: string | null) {
  return useSWR(sessionId ? `session-${sessionId}` : null, () => {
    if (!sessionId) return null;
    return api.sessions.get(sessionId);
  });
}

interface CreateSessionOptions {
  title?: string;
  currentSessionCount: number;
}

export function useCreateSession() {
  const { mutate } = useSWRConfig();
  const [, setCreationState] = useAtom(creationStateAtom);

  return async (projectId: string, options: CreateSessionOptions) => {
    const { title, currentSessionCount } = options;

    setCreationState({ isCreating: true, projectId, sessionCountAtCreation: currentSessionCount });

    try {
      const session = await api.sessions.create(projectId, { title });
      mutate(
        `sessions-${projectId}`,
        (current: Session[] = []) => {
          if (current.some((existing) => existing.id === session.id)) return current;
          return [...current, session];
        },
        false,
      );
    } catch {
      setCreationState({ isCreating: false, projectId: null, sessionCountAtCreation: 0 });
    }
  };
}

export function useDeleteSession() {
  const { mutate } = useSWRConfig();

  return async (session: Session, onDeleted: () => void) => {
    const cacheKey = `sessions-${session.projectId}`;

    mutate(
      cacheKey,
      (current: Session[] = []) => current.filter((existing) => existing.id !== session.id),
      false,
    );
    onDeleted();

    try {
      await api.sessions.delete(session.id);
    } catch {
      mutate(cacheKey);
    }
  };
}
