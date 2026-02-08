import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";
import { api } from "./api";
import type { Session } from "@lab/client";

const preferredModelAtom = atomWithStorage<string | null>("preferred-model", null);

function usePreferredModel() {
  return useAtom(preferredModelAtom);
}

interface UseModelSelectionOptions {
  syncTo?: (modelId: string) => void;
  currentSyncedValue?: string | null;
}

export function useModelSelection(options?: UseModelSelectionOptions) {
  const { data: modelGroups, isLoading } = useModels();
  const [preferredModel, setPreferredModel] = usePreferredModel();

  const modelId = (() => {
    if (!modelGroups) return null;

    const allModels = modelGroups.flatMap(({ models }) => models);
    const validModel = allModels.find(({ value }) => value === preferredModel);
    const fallback = modelGroups[0]?.models[0];

    return validModel?.value ?? fallback?.value ?? null;
  })();

  useEffect(() => {
    if (modelId && options?.syncTo && options.currentSyncedValue === null) {
      options.syncTo(modelId);
    }
  }, [modelId, options]);

  const setModelId = (value: string) => {
    setPreferredModel(value);
    options?.syncTo?.(value);
  };

  return { modelGroups, modelId, setModelId, isLoading };
}

export function useProjects() {
  return useSWR("projects", () => api.projects.list());
}

interface ModelGroup {
  provider: string;
  models: { label: string; value: string }[];
}

function useModels() {
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

export function useSessions(projectId: string | null) {
  return useSWR(
    projectId ? `sessions-${projectId}` : null,
    () => {
      if (!projectId) return [];
      return api.sessions.list(projectId);
    },
    { keepPreviousData: true },
  );
}

export function useSession(sessionId: string | null) {
  return useSWR(sessionId ? `session-${sessionId}` : null, () => {
    if (!sessionId) return null;
    return api.sessions.get(sessionId);
  });
}

interface CreateSessionOptions {
  title?: string;
  initialMessage?: string;
}

export function useCreateSession() {
  const { mutate } = useSWRConfig();

  return async (projectId: string, options: CreateSessionOptions = {}): Promise<Session | null> => {
    const { title, initialMessage } = options;
    const optimisticId = `optimistic-${Date.now()}`;
    const now = new Date().toISOString();

    const optimisticSession: Session = {
      id: optimisticId,
      projectId,
      title: title ?? null,
      opencodeSessionId: null,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    };

    const sessionsKey = `sessions-${projectId}`;

    mutate(sessionsKey, (current: Session[] = []) => [...current, optimisticSession], false);

    try {
      const session = await api.sessions.create(projectId, { title, initialMessage });

      mutate(
        sessionsKey,
        (current: Session[] = []) => {
          const withoutOptimistic = current.filter((existing) => existing.id !== optimisticId);
          const alreadyExists = withoutOptimistic.some((existing) => existing.id === session.id);
          if (alreadyExists) return withoutOptimistic;
          return [...withoutOptimistic, session];
        },
        false,
      );

      mutate(`session-${session.id}`, session, false);

      return session;
    } catch {
      mutate(
        sessionsKey,
        (current: Session[] = []) => current.filter((existing) => existing.id !== optimisticId),
        false,
      );
      return null;
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
