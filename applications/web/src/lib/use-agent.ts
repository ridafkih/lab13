"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  createAcpEventParser,
  getAgentApiUrl,
  resetTranslationState,
  translateAcpEvent,
  useAcpSession,
} from "./acp-session";
import type { AcpEvent, ContentPart } from "./acp-types";
import { api } from "./api";
import type { Attachment } from "./use-attachments";

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  parts: ContentPart[];
}

interface SendMessageOptions {
  content: string;
  modelId?: string;
  attachments?: Attachment[];
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | {
      type: "error";
      message?: string;
      isRetryable?: boolean;
      statusCode?: number;
    };

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
  sandboxSessionId: string;
  messages: MessageState[];
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return null;
}

function extractEventItem(
  eventData: Record<string, unknown>
): Record<string, unknown> {
  return getRecord(eventData.item) ?? eventData;
}

function extractItemId(
  item: Record<string, unknown>,
  fallback: string
): string {
  return typeof item.item_id === "string" ? item.item_id : fallback;
}

function extractContentParts(
  item: Record<string, unknown>
): Record<string, unknown>[] {
  return Array.isArray(item.content) ? item.content : [];
}

function tryParseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

type ToolCallStatus = "in_progress" | "completed" | "error";

function isToolCallStatus(value: unknown): value is ToolCallStatus {
  return value === "in_progress" || value === "completed" || value === "error";
}

function normalizeToolCall(raw: Record<string, unknown>): ContentPart {
  const input =
    typeof raw.arguments === "string"
      ? tryParseJson(raw.arguments)
      : (getRecord(raw.input) ?? {});
  return {
    type: "tool_call",
    id: getString(raw.call_id ?? raw.id),
    name: getString(raw.name),
    input,
    status: isToolCallStatus(raw.status) ? raw.status : "in_progress",
  };
}

function normalizeToolResult(raw: Record<string, unknown>): ContentPart {
  return {
    type: "tool_result",
    tool_call_id: getString(raw.call_id ?? raw.tool_call_id),
    output: typeof raw.output === "string" ? raw.output : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function normalizeTextPart(raw: Record<string, unknown>): ContentPart {
  return { type: "text", text: getString(raw.text) };
}

function normalizeSinglePart(raw: Record<string, unknown>): ContentPart {
  const type = getString(raw.type);
  if (type === "tool_call") {
    return normalizeToolCall(raw);
  }
  if (type === "tool_result") {
    return normalizeToolResult(raw);
  }
  if (type === "text") {
    return normalizeTextPart(raw);
  }
  return { type: "text", text: "" };
}

function normalizeContentParts(
  rawParts: Record<string, unknown>[]
): ContentPart[] {
  return rawParts.map(normalizeSinglePart);
}

/**
 * Mark tool_call parts as "completed" or "error" when a matching tool_result
 * exists in the same message.
 */
function resolveToolCallStatuses(parts: ContentPart[]): ContentPart[] {
  const resultsByCallId = new Map<
    string,
    { output?: string; error?: string }
  >();
  for (const part of parts) {
    if (part.type === "tool_result" && "tool_call_id" in part) {
      resultsByCallId.set(part.tool_call_id, {
        output: part.output,
        error: part.error,
      });
    }
  }

  if (resultsByCallId.size === 0) {
    return parts;
  }

  return parts.map((part) => {
    if (part.type === "tool_call" && part.status === "in_progress") {
      const result = resultsByCallId.get(part.id);
      if (result) {
        return {
          ...part,
          status: result.error ? "error" : "completed",
        };
      }
    }
    return part;
  });
}

/**
 * Idempotent message accumulator. Processes events sequentially and builds
 * the message list deterministically based on event data properties alone.
 *
 * Key behavior:
 * - `turn.started` resets the current assistant context
 * - `kind: "message"` items create new messages
 * - `kind: "tool_call"` / `kind: "tool_result"` items merge into the
 *    current assistant message
 * - Text deltas arriving after tool parts split into a new message,
 *   so each "step" (text + tools) renders as a distinct chat bubble
 *
 * Both replay and SSE use this same accumulator, guaranteeing identical output.
 */
class MessageAccumulator {
  messages: MessageState[] = [];
  private readonly itemIdToMessageId = new Map<string, string>();
  private currentAssistantId: string | null = null;

  processEvent(event: AcpEvent): void {
    switch (event.type) {
      case "turn.started":
        this.currentAssistantId = null;
        break;
      case "item.started":
        this.handleItemStarted(event);
        break;
      case "item.delta":
        this.handleItemDelta(event);
        break;
      case "item.completed":
        this.handleItemCompleted(event);
        break;
      default:
        break;
    }
  }

  getMessages(): MessageState[] {
    return this.messages.map((message) => ({
      ...message,
      parts: resolveToolCallStatuses(message.parts),
    }));
  }

  private handleItemStarted(event: AcpEvent): void {
    const item = extractEventItem(event.data);
    const itemId = extractItemId(item, `item-${event.sequence}`);
    const kind = getString(item.kind);
    const role = getString(item.role);
    const content = normalizeContentParts(extractContentParts(item));

    if (role === "user" && kind === "message") {
      this.messages.push({ id: itemId, role: "user", parts: content });
      this.itemIdToMessageId.set(itemId, itemId);
      return;
    }

    if (kind === "message") {
      this.messages.push({ id: itemId, role: "assistant", parts: content });
      this.itemIdToMessageId.set(itemId, itemId);
      this.currentAssistantId = itemId;
      return;
    }

    // tool_call or tool_result
    // If there is no active assistant message, start a new assistant step
    // so tool activity renders as its own bubble in history/replay.
    if (!this.currentAssistantId) {
      const assistantStep: MessageState = {
        id: itemId,
        role: "assistant",
        parts: content,
      };
      this.messages.push(assistantStep);
      this.itemIdToMessageId.set(itemId, itemId);
      this.currentAssistantId = itemId;
      return;
    }

    // Otherwise merge into the current assistant message.
    if (this.currentAssistantId) {
      this.itemIdToMessageId.set(itemId, this.currentAssistantId);
      const activeAssistantMessage = this.messages.find(
        (message) => message.id === this.currentAssistantId
      );
      if (activeAssistantMessage && content.length > 0) {
        activeAssistantMessage.parts = [
          ...activeAssistantMessage.parts,
          ...content,
        ];
      }
    }
  }

  private handleItemDelta(event: AcpEvent): void {
    const rawItemId = getString(event.data.item_id) || null;
    const deltaText = getString(event.data.delta) || null;
    if (!(rawItemId && deltaText)) {
      return;
    }

    const messageId = this.itemIdToMessageId.get(rawItemId) ?? rawItemId;
    const existingMessage = this.messages.find(
      (message) => message.id === messageId
    );
    if (!existingMessage) {
      return;
    }

    // When text arrives on a message that already has tool parts, the
    // assistant is continuing after tool execution. Split into a new message
    // so each step renders as a distinct chat bubble.
    const hasToolParts = existingMessage.parts.some(
      (part) => part.type === "tool_call" || part.type === "tool_result"
    );

    const targetMessage: MessageState = hasToolParts
      ? {
          id: `${rawItemId}-cont-${event.sequence}`,
          role: "assistant",
          parts: [],
        }
      : existingMessage;

    if (hasToolParts) {
      this.messages.push(targetMessage);
      this.itemIdToMessageId.set(rawItemId, targetMessage.id);
      this.currentAssistantId = targetMessage.id;
    }

    const lastPart = targetMessage.parts.at(-1);
    if (lastPart?.type === "text") {
      lastPart.text += deltaText;
    } else {
      targetMessage.parts.push({ type: "text", text: deltaText });
    }
  }

  private handleItemCompleted(event: AcpEvent): void {
    const item = extractEventItem(event.data);
    const itemId = getString(item.item_id) || null;
    if (!itemId) {
      return;
    }

    const messageId = this.itemIdToMessageId.get(itemId) ?? itemId;
    const message = this.messages.find(
      (currentMessage) => currentMessage.id === messageId
    );
    if (!message) {
      return;
    }

    // For the message's own item (not a merged tool_call/tool_result),
    // set content if deltas never arrived.
    if (messageId === itemId && message.parts.length === 0) {
      const content = normalizeContentParts(extractContentParts(item));
      if (content.length > 0) {
        message.parts = content;
      }
    }
  }
}

async function createSandboxSession(
  labSessionId: string,
  modelId?: string
): Promise<string> {
  const apiUrl = getAgentApiUrl();
  const body: Record<string, string> = {};
  if (modelId) {
    body.model = modelId;
  }
  const response = await fetch(`${apiUrl}/acp/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lab-Session-Id": labSessionId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Failed to create sandbox agent session");
  }

  const data = await response.json();
  return data.id;
}

async function fetchSessionData(
  labSessionId: string
): Promise<SessionData | null> {
  const labSession = await api.sessions.get(labSessionId);
  const sandboxSessionId = labSession.sandboxSessionId;

  return {
    sandboxSessionId: sandboxSessionId ?? "",
    messages: [],
  };
}

async function readSSEStream(
  response: Response,
  onEvent: (event: AcpEvent) => void
): Promise<void> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createAcpEventParser(onEvent);

  try {
    const processReader = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }

      parser.feed(decoder.decode(value, { stream: true }));
      await processReader();
    };

    await processReader();
    const trailing = decoder.decode();
    if (trailing) {
      parser.feed(trailing);
    }
  } finally {
    reader.releaseLock();
  }
}

function getAgentMessagesKey(labSessionId: string): string {
  return `agent-messages-${labSessionId}`;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { publish } = useAcpSession();
  const { mutate } = useSWRConfig();
  const [streamedMessages, setStreamedMessages] = useState<
    MessageState[] | null
  >(null);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    type: "idle",
  });
  const [questionRequests, setQuestionRequests] = useState<Map<string, string>>(
    () => new Map()
  );
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionDataRef = useRef<SessionData | null>(null);
  const accumulatorRef = useRef<MessageAccumulator | null>(null);

  const isOptimistic = labSessionId === "new";

  const {
    data: sessionData,
    error: swrError,
    isLoading,
  } = useSWR<SessionData | null>(
    labSessionId && !isOptimistic ? getAgentMessagesKey(labSessionId) : null,
    () => fetchSessionData(labSessionId)
  );

  useEffect(() => {
    sessionDataRef.current = sessionData ?? null;
    if (swrError) {
      setError(
        swrError instanceof Error ? swrError : new Error("Failed to initialize")
      );
    }
  }, [sessionData, swrError]);

  const messages = streamedMessages ?? sessionData?.messages ?? [];
  const sandboxSessionId = sessionData?.sandboxSessionId ?? null;

  useEffect(() => {
    if (!sandboxSessionId) {
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    const apiUrl = getAgentApiUrl();
    resetTranslationState();
    const messageAccumulator = new MessageAccumulator();
    accumulatorRef.current = messageAccumulator;

    const clearSendingTimeout = () => {
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    };

    const handleTurnEnded = () => {
      clearSendingTimeout();
      setIsSending(false);
      setSessionStatus({ type: "idle" });

      mutate(
        getAgentMessagesKey(labSessionId),
        (current: SessionData | null | undefined) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            messages: messageAccumulator.getMessages(),
          };
        },
        { revalidate: false }
      );
    };

    const handleError = (event: AcpEvent) => {
      clearSendingTimeout();
      setIsSending(false);
      const message =
        typeof event.data.message === "string"
          ? event.data.message
          : "An error occurred";
      setSessionStatus({ type: "error", message });
    };

    const handleQuestionRequested = (event: AcpEvent) => {
      const questionId = getString(event.data.id) || null;
      const callId = getString(event.data.call_id) || null;
      if (questionId && callId) {
        setQuestionRequests((previous) =>
          new Map(previous).set(callId, questionId)
        );
      }
    };

    const handleQuestionResolved = (event: AcpEvent) => {
      const callId = getString(event.data.call_id) || null;
      if (callId) {
        setQuestionRequests((previous) => {
          const next = new Map(previous);
          next.delete(callId);
          return next;
        });
      }
    };

    const processEvent = (event: AcpEvent) => {
      publish(event);
      messageAccumulator.processEvent(event);

      switch (event.type) {
        case "turn.started":
          setSessionStatus({ type: "busy" });
          break;
        case "turn.ended":
          handleTurnEnded();
          break;
        case "error":
          handleError(event);
          break;
        case "question.requested":
          handleQuestionRequested(event);
          break;
        case "question.resolved":
          handleQuestionResolved(event);
          break;
        default:
          break;
      }

      if (
        event.type === "item.started" ||
        event.type === "item.delta" ||
        event.type === "item.completed"
      ) {
        setStreamedMessages(messageAccumulator.getMessages());
      }
    };

    const replayHistory = async (): Promise<number> => {
      const historyResponse = await fetch(`${apiUrl}/acp/history`, {
        headers: { "X-Lab-Session-Id": labSessionId },
        signal,
      });

      if (!historyResponse.ok) {
        return 0;
      }

      const events: { sequence: number; eventData: unknown }[] =
        await historyResponse.json();

      for (const event of events) {
        const eventData = getRecord(event.eventData);
        if (!eventData) {
          continue;
        }

        const translated = translateAcpEvent(eventData, event.sequence);
        for (const translatedEvent of translated) {
          messageAccumulator.processEvent(translatedEvent);
        }
      }

      if (events.length > 0) {
        setStreamedMessages(messageAccumulator.getMessages());
      }

      return events.reduce(
        (highestSequence, event) => Math.max(highestSequence, event.sequence),
        0
      );
    };

    const streamLiveEvents = async (lastSequence: number) => {
      const params = new URLSearchParams({ sessionId: labSessionId });
      if (lastSequence > 0) {
        params.set("offset", String(lastSequence));
      }
      const eventsUrl = `${apiUrl}/acp/events?${params}`;

      while (!signal.aborted) {
        try {
          const response = await fetch(eventsUrl, {
            headers: {
              Accept: "text/event-stream",
              "X-Lab-Session-Id": labSessionId,
            },
            signal,
          });

          if (!(response.ok && response.body)) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }

          await readSSEStream(response, processEvent);
        } catch (error) {
          if (signal.aborted) {
            return;
          }
          console.warn("SSE connection error, reconnecting:", error);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    };

    const resolveLastSequence = async (): Promise<number> =>
      replayHistory().catch(() => 0);

    const connect = async () => {
      const lastSequence = await resolveLastSequence();
      if (signal.aborted) {
        return;
      }
      await streamLiveEvents(lastSequence);
    };

    connect();

    return () => {
      abortController.abort();
    };
  }, [sandboxSessionId, labSessionId, mutate, publish]);

  const sendMessage = async ({ content, modelId }: SendMessageOptions) => {
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
      5 * 60 * 1000
    );

    const ensureActiveSandboxSessionId = async (): Promise<string> => {
      if (sandboxSessionId) {
        return sandboxSessionId;
      }

      const newSandboxSessionId = await createSandboxSession(
        labSessionId,
        modelId
      );
      mutate(
        getAgentMessagesKey(labSessionId),
        (current: SessionData | null | undefined): SessionData => ({
          sandboxSessionId: newSandboxSessionId,
          messages: current?.messages ?? [],
        }),
        { revalidate: false }
      );
      mutate(`session-${labSessionId}`);
      return newSandboxSessionId;
    };

    try {
      const activeSandboxSessionId = await ensureActiveSandboxSessionId();

      const apiUrl = getAgentApiUrl();
      const body: Record<string, string> = {
        sessionId: activeSandboxSessionId,
        message: content,
      };
      const response = await fetch(`${apiUrl}/acp/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (error) {
      const errorInstance =
        error instanceof Error ? error : new Error("Failed to send message");
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
    if (!sandboxSessionId) {
      return;
    }

    try {
      const apiUrl = getAgentApiUrl();
      await fetch(`${apiUrl}/acp/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
      });
      setIsSending(false);
      setSessionStatus({ type: "idle" });
    } catch (error) {
      console.warn("Failed to abort session:", error);
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
