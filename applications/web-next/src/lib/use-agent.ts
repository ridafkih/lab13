"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createOpencodeClient, type Message, type Part } from "@opencode-ai/sdk/client";
import { api } from "./api";
import { useOpenCodeSession, type Event } from "./opencode-session";

interface LoadedMessage {
  info: Message;
  parts: Part[];
}

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
}

interface SendMessageOptions {
  content: string;
  modelId?: string;
}

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  isSending: boolean;
}

interface CachedSessionData {
  opencodeSessionId: string;
  messages: MessageState[];
}

const sessionCache = new Map<string, CachedSessionData>();
const pendingPrefetches = new Map<string, Promise<CachedSessionData | null>>();

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

function createSessionClient(labSessionId: string) {
  return createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": labSessionId },
  });
}

function parseLoadedMessages(data: LoadedMessage[]): MessageState[] {
  return data.map((message) => ({
    id: message.info.id,
    role: message.info.role,
    parts: message.parts,
  }));
}

function getSessionIdFromEvent(event: Event): string | undefined {
  if (!("properties" in event)) return undefined;

  const properties = event.properties;

  if ("sessionID" in properties && typeof properties.sessionID === "string") {
    return properties.sessionID;
  }

  if ("info" in properties && typeof properties.info === "object" && properties.info !== null) {
    const info = properties.info;
    if ("sessionID" in info && typeof info.sessionID === "string") {
      return info.sessionID;
    }
  }

  if ("part" in properties && typeof properties.part === "object" && properties.part !== null) {
    const part = properties.part;
    if ("sessionID" in part && typeof part.sessionID === "string") {
      return part.sessionID;
    }
  }

  return undefined;
}

async function fetchSessionMessages(labSessionId: string): Promise<CachedSessionData | null> {
  const labSession = await api.sessions.get(labSessionId);
  if (!labSession.opencodeSessionId) return null;

  const client = createSessionClient(labSessionId);
  const messagesResponse = await client.session.messages({
    path: { id: labSession.opencodeSessionId },
  });

  if (!messagesResponse.data) return null;

  return {
    opencodeSessionId: labSession.opencodeSessionId,
    messages: parseLoadedMessages(messagesResponse.data),
  };
}

export async function prefetchSessionMessages(labSessionId: string): Promise<void> {
  if (sessionCache.has(labSessionId)) return;
  if (pendingPrefetches.has(labSessionId)) return;

  const prefetchPromise = (async (): Promise<CachedSessionData | null> => {
    try {
      const data = await fetchSessionMessages(labSessionId);
      if (data) sessionCache.set(labSessionId, data);
      return data;
    } catch {
      return null;
    } finally {
      pendingPrefetches.delete(labSessionId);
    }
  })();

  pendingPrefetches.set(labSessionId, prefetchPromise);
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { subscribe } = useOpenCodeSession();
  const [opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<MessageState[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const currentOpencodeSessionRef = useRef<string | null>(null);

  const opencodeClient = useMemo(() => {
    if (!labSessionId) return null;
    return createSessionClient(labSessionId);
  }, [labSessionId]);

  useEffect(() => {
    setOpencodeSessionId(null);
    currentOpencodeSessionRef.current = null;

    const cached = sessionCache.get(labSessionId);
    if (cached) {
      setMessages(cached.messages);
      setOpencodeSessionId(cached.opencodeSessionId);
      currentOpencodeSessionRef.current = cached.opencodeSessionId;
      setIsLoading(false);
      return;
    }

    setMessages([]);

    if (!labSessionId || !opencodeClient) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const applySessionData = (sessionId: string, sessionMessages: MessageState[]) => {
      setMessages(sessionMessages);
      setOpencodeSessionId(sessionId);
      currentOpencodeSessionRef.current = sessionId;
      sessionCache.set(labSessionId, { opencodeSessionId: sessionId, messages: sessionMessages });
      setIsLoading(false);
    };

    const getOrCreateOpencodeSession = async (): Promise<string> => {
      const labSession = await api.sessions.get(labSessionId);
      if (labSession.opencodeSessionId) return labSession.opencodeSessionId;

      const response = await opencodeClient.session.create({});
      if (response.error || !response.data) {
        throw new Error("Failed to create OpenCode session");
      }

      await api.sessions.update(labSessionId, { opencodeSessionId: response.data.id });
      return response.data.id;
    };

    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const pending = pendingPrefetches.get(labSessionId);
        if (pending) {
          const prefetched = await pending;
          if (cancelled) return;
          if (prefetched) {
            applySessionData(prefetched.opencodeSessionId, prefetched.messages);
            return;
          }
        }

        const sessionId = await getOrCreateOpencodeSession();
        if (cancelled) return;

        const messagesResponse = await opencodeClient.session.messages({
          path: { id: sessionId },
        });
        if (cancelled) return;

        const loadedMessages = parseLoadedMessages(messagesResponse.data ?? []);
        applySessionData(sessionId, loadedMessages);
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error : new Error("Failed to initialize"));
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [labSessionId, opencodeClient]);

  useEffect(() => {
    if (!opencodeSessionId) return;

    const handleMessageUpdated = (info: Message) => {
      setMessages((previous) => {
        const existing = previous.find((message) => message.id === info.id);
        if (existing) return previous;
        return [...previous, { id: info.id, role: info.role, parts: [] }];
      });
    };

    const handleMessagePartUpdated = (part: Part) => {
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== part.messageID) return message;

          const partIndex = message.parts.findIndex((existing) => existing.id === part.id);
          if (partIndex === -1) {
            return { ...message, parts: [...message.parts, part] };
          }

          const newParts = [...message.parts];
          newParts[partIndex] = part;
          return { ...message, parts: newParts };
        }),
      );
    };

    const processEvent = (event: Event) => {
      const eventSessionId = getSessionIdFromEvent(event);
      if (eventSessionId !== currentOpencodeSessionRef.current) return;

      if (event.type === "message.updated") {
        handleMessageUpdated(event.properties.info);
      }

      if (event.type === "message.part.updated") {
        handleMessagePartUpdated(event.properties.part);
      }

      if (event.type === "session.idle") {
        setIsSending(false);
      }
    };

    return subscribe(processEvent);
  }, [subscribe, opencodeSessionId]);

  const sendMessage = useCallback(
    async ({ content, modelId }: SendMessageOptions) => {
      if (!opencodeSessionId || !opencodeClient) {
        throw new Error("Session not initialized");
      }

      setError(null);
      setIsSending(true);

      try {
        const [providerID, modelID] = modelId?.split("/") ?? [];
        const response = await opencodeClient.session.promptAsync({
          path: { id: opencodeSessionId },
          body: {
            model: {
              providerID,
              modelID,
            },
            parts: [{ type: "text", text: content }],
          },
        });

        if (response.error) {
          throw new Error(`Failed to send message: ${JSON.stringify(response.error)}`);
        }
      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error("Failed to send message");
        setError(errorInstance);
        setIsSending(false);
        throw errorInstance;
      }
    },
    [opencodeSessionId, opencodeClient],
  );

  return {
    isLoading,
    messages,
    error,
    sendMessage,
    isSending,
  };
}
