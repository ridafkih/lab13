"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { createOpencodeClient, type Message, type Part } from "@opencode-ai/sdk/v2/client";
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

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "error"; message?: string };

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  abortSession: () => Promise<void>;
  isSending: boolean;
  sessionStatus: SessionStatus;
  questionRequests: Map<string, string>;
}

interface SessionData {
  opencodeSessionId: string;
  messages: MessageState[];
}

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

function sortPartsById(parts: Part[]): Part[] {
  return parts.toSorted((partA, partB) => partA.id.localeCompare(partB.id));
}

function upsertPart(parts: Part[], part: Part): Part[] {
  const existingIndex = parts.findIndex((existing) => existing.id === part.id);
  if (existingIndex === -1) {
    return [...parts, part];
  }
  return parts.map((existing, index) => (index === existingIndex ? part : existing));
}

interface PendingQuestion {
  callID: string;
  requestID: string;
}

function extractPendingQuestion(question: unknown): PendingQuestion | null {
  if (typeof question !== "object" || question === null) {
    return null;
  }

  if (!("id" in question) || typeof question.id !== "string") {
    return null;
  }

  if (!("tool" in question) || typeof question.tool !== "object" || question.tool === null) {
    return null;
  }

  if (!("callID" in question.tool) || typeof question.tool.callID !== "string") {
    return null;
  }

  return { callID: question.tool.callID, requestID: question.id };
}

async function fetchPendingQuestions(labSessionId: string): Promise<PendingQuestion[]> {
  const client = createSessionClient(labSessionId);
  const response = await client.question.list();
  if (response.error || !response.data) {
    return [];
  }

  const pendingQuestions: PendingQuestion[] = [];
  for (const question of response.data) {
    const extracted = extractPendingQuestion(question);
    if (extracted) {
      pendingQuestions.push(extracted);
    }
  }
  return pendingQuestions;
}

async function fetchSessionData(labSessionId: string): Promise<SessionData | null> {
  const labSession = await api.sessions.get(labSessionId);
  const client = createSessionClient(labSessionId);

  let opencodeSessionId = labSession.opencodeSessionId;

  if (!opencodeSessionId) {
    const response = await client.session.create({});
    if (response.error || !response.data) {
      throw new Error("Failed to create OpenCode session");
    }
    opencodeSessionId = response.data.id;
  }

  const messagesResponse = await client.session.messages({
    sessionID: opencodeSessionId,
  });

  if (messagesResponse.error) {
    throw new Error(`Failed to fetch messages: ${JSON.stringify(messagesResponse.error)}`);
  }

  return {
    opencodeSessionId,
    messages: parseLoadedMessages(messagesResponse.data ?? []),
  };
}

function getAgentMessagesKey(labSessionId: string): string {
  return `agent-messages-${labSessionId}`;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { subscribe } = useOpenCodeSession();
  const { mutate } = useSWRConfig();
  const [streamedMessages, setStreamedMessages] = useState<MessageState[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ type: "idle" });
  const [questionRequests, setQuestionRequests] = useState<Map<string, string>>(() => new Map());
  const currentOpencodeSessionRef = useRef<string | null>(null);
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamedMessagesRef = useRef<MessageState[] | null>(null);
  const sessionDataRef = useRef<SessionData | null>(null);

  const opencodeClient = labSessionId ? createSessionClient(labSessionId) : null;

  const {
    data: sessionData,
    error: swrError,
    isLoading,
  } = useSWR<SessionData | null>(labSessionId ? getAgentMessagesKey(labSessionId) : null, () =>
    fetchSessionData(labSessionId),
  );

  useEffect(() => {
    sessionDataRef.current = sessionData ?? null;
    if (sessionData?.opencodeSessionId) {
      currentOpencodeSessionRef.current = sessionData.opencodeSessionId;
    }
  }, [sessionData]);

  useEffect(() => {
    if (!labSessionId) return;
    fetchPendingQuestions(labSessionId).then((pendingQuestions) => {
      if (pendingQuestions.length > 0) {
        setQuestionRequests(
          new Map(pendingQuestions.map((question) => [question.callID, question.requestID])),
        );
      }
    });
  }, [labSessionId]);

  useEffect(() => {
    if (swrError) {
      setError(swrError instanceof Error ? swrError : new Error("Failed to initialize"));
    }
  }, [swrError]);

  useEffect(() => {
    streamedMessagesRef.current = streamedMessages;
  }, [streamedMessages]);

  const messages = streamedMessages ?? sessionData?.messages ?? [];
  const opencodeSessionId = sessionData?.opencodeSessionId ?? null;

  useEffect(() => {
    if (!opencodeSessionId) return;

    const handleMessageUpdated = (info: Message) => {
      setStreamedMessages((previous) => {
        const base = previous ?? sessionDataRef.current?.messages ?? [];
        const existing = base.find((message) => message.id === info.id);
        if (existing) return base;
        return [...base, { id: info.id, role: info.role, parts: [] }];
      });
    };

    const handleMessagePartUpdated = (part: Part) => {
      setStreamedMessages((previous) => {
        const base = previous ?? sessionDataRef.current?.messages ?? [];
        return base.map((message) => {
          if (message.id !== part.messageID) return message;
          return { ...message, parts: sortPartsById(upsertPart(message.parts, part)) };
        });
      });
    };

    const processEvent = (event: Event) => {
      const sessionSpecificEvents = [
        "message.updated",
        "message.part.updated",
        "session.idle",
        "session.error",
        "session.status",
        "question.asked",
        "question.replied",
        "question.rejected",
      ];

      if (sessionSpecificEvents.includes(event.type)) {
        const eventSessionId = getSessionIdFromEvent(event);
        if (eventSessionId !== currentOpencodeSessionRef.current) {
          return;
        }
      }

      if (event.type === "message.updated") {
        handleMessageUpdated(event.properties.info);
      }

      if (event.type === "message.part.updated") {
        handleMessagePartUpdated(event.properties.part);
      }

      if (event.type === "session.status") {
        const status = event.properties.status as SessionStatus;
        setSessionStatus(status);
      }

      if (event.type === "session.idle") {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        setIsSending(false);
        setSessionStatus({ type: "idle" });

        if (streamedMessagesRef.current) {
          mutate(
            getAgentMessagesKey(labSessionId),
            (current: SessionData | null | undefined) => {
              if (!current) return current;
              return { ...current, messages: streamedMessagesRef.current! };
            },
            { revalidate: false },
          );
        }
        setStreamedMessages(null);
      }

      if (event.type === "session.error") {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        setIsSending(false);
        setSessionStatus({ type: "error" });
      }

      if (event.type === "question.asked") {
        const props = event.properties as unknown as { callID?: string; requestID?: string };
        const callID = props.callID;
        const requestID = props.requestID;
        if (callID && requestID) {
          setQuestionRequests((prev) => new Map(prev).set(callID, requestID));
        }
      }

      if (event.type === "question.replied" || event.type === "question.rejected") {
        const props = event.properties as unknown as { callID?: string };
        const callID = props.callID;
        if (callID) {
          setQuestionRequests((prev) => {
            const next = new Map(prev);
            next.delete(callID);
            return next;
          });
        }
      }
    };

    return subscribe(processEvent);
  }, [subscribe, opencodeSessionId, mutate, labSessionId]);

  const sendMessage = async ({ content, modelId }: SendMessageOptions) => {
    if (!opencodeSessionId || !opencodeClient) {
      throw new Error("Session not initialized");
    }

    setError(null);
    setIsSending(true);

    if (sendingTimeoutRef.current) {
      clearTimeout(sendingTimeoutRef.current);
    }

    sendingTimeoutRef.current = setTimeout(
      () => {
        setIsSending(false);
        sendingTimeoutRef.current = null;
      },
      5 * 60 * 1000,
    );

    try {
      const [providerID, modelID] = modelId?.split("/") ?? [];
      const response = await opencodeClient.session.promptAsync({
        sessionID: opencodeSessionId,
        model: {
          providerID,
          modelID,
        },
        parts: [{ type: "text", text: content }],
      });

      if (response.error) {
        throw new Error(`Failed to send message: ${JSON.stringify(response.error)}`);
      }
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error("Failed to send message");
      setError(errorInstance);
      setIsSending(false);
      throw errorInstance;
    } finally {
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    }
  };

  const abortSession = async () => {
    if (!currentOpencodeSessionRef.current || !opencodeClient) return;

    try {
      await opencodeClient.session.abort({
        sessionID: currentOpencodeSessionRef.current,
      });
    } catch (error) {
      console.warn(error);
    }
  };

  return {
    isLoading,
    messages,
    error,
    sendMessage,
    abortSession,
    isSending,
    sessionStatus,
    questionRequests,
  };
}
