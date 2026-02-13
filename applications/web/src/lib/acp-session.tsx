"use client";

import { createParser, type EventSourceMessage } from "eventsource-parser";
import { createContext, type ReactNode, useContext, useRef } from "react";
import type { AcpEvent } from "./acp-types";

export type EventListener = (event: AcpEvent) => void;

export function getAgentApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be set");
  }
  return apiUrl;
}

interface AcpSessionContextValue {
  sessionId: string | null;
  subscribe: (listener: EventListener) => () => void;
  publish: (event: AcpEvent) => void;
}

const AcpSessionContext = createContext<AcpSessionContextValue | null>(null);

interface AcpSessionProviderProps {
  sessionId: string | null;
  children: ReactNode;
}

export function parseSseMessage(message: EventSourceMessage): AcpEvent[] {
  if (!message.data) {
    return [];
  }

  try {
    const parsed = JSON.parse(message.data);
    const sequence = message.id ? Number(message.id) : 0;
    return translateAcpEvent(parsed, sequence);
  } catch {
    return [];
  }
}

let activeItemId: string | null = null;
let turnCounter = 0;
const emittedToolCallIds = new Set<string>();

export function resetTranslationState() {
  activeItemId = null;
  turnCounter = 0;
  emittedToolCallIds.clear();
}

function makeAssistantItem(itemId: string) {
  return { item_id: itemId, kind: "message", role: "assistant", content: [] };
}

function finishTurn(sequence: number): AcpEvent[] {
  const events: AcpEvent[] = [];
  if (activeItemId) {
    events.push({
      type: "item.completed",
      sequence,
      data: { item: makeAssistantItem(activeItemId) },
    });
    activeItemId = null;
  }
  events.push({ type: "turn.ended", sequence, data: {} });
  return events;
}

function startNewMessage(sequence: number): AcpEvent[] {
  turnCounter++;
  const itemId = `msg-${turnCounter}`;
  activeItemId = itemId;

  return [
    { type: "turn.started", sequence, data: {} },
    {
      type: "item.started",
      sequence,
      data: { item: makeAssistantItem(itemId) },
    },
  ];
}

function appendTextDelta(sequence: number, text: string): AcpEvent[] {
  if (!activeItemId) {
    return [];
  }
  return [
    {
      type: "item.delta",
      sequence,
      data: { item_id: activeItemId, delta: text },
    },
  ];
}

function handleMessageChunk(
  content: { text: string; type: string },
  sequence: number
): AcpEvent[] {
  if (!activeItemId) {
    const events = startNewMessage(sequence);
    if (content.text) {
      events.push(...appendTextDelta(sequence, content.text));
    }
    return events;
  }
  if (content.text) {
    return appendTextDelta(sequence, content.text);
  }
  return [];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return null;
}

function extractSessionUpdate(
  parsed: Record<string, unknown>
): Record<string, unknown> | null {
  const method = typeof parsed.method === "string" ? parsed.method : undefined;
  const params = toRecord(parsed.params);
  if (method !== "session/update" || !params) {
    return null;
  }
  const update = toRecord(params.update);
  return update ?? null;
}

function extractMeta(update: Record<string, unknown>): Record<string, unknown> {
  const meta = toRecord(update._meta);
  if (!meta) {
    return {};
  }
  return toRecord(meta.claudeCode) ?? {};
}

function handleToolCallEvent(
  update: Record<string, unknown>,
  sequence: number
): AcpEvent[] {
  const toolCallId =
    typeof update.toolCallId === "string" ? update.toolCallId : "";
  if (!toolCallId) {
    return [];
  }

  const rawInput = toRecord(update.rawInput);
  if (!rawInput || Object.keys(rawInput).length === 0) {
    return [];
  }
  if (emittedToolCallIds.has(toolCallId)) {
    return [];
  }
  emittedToolCallIds.add(toolCallId);

  const claudeCode = extractMeta(update);
  const toolName =
    typeof claudeCode.toolName === "string" ? claudeCode.toolName : "";

  const events: AcpEvent[] = [];

  if (activeItemId) {
    events.push({
      type: "item.completed",
      sequence,
      data: { item: makeAssistantItem(activeItemId) },
    });
    activeItemId = null;
  }

  events.push({
    type: "item.started",
    sequence,
    data: {
      item: {
        item_id: toolCallId,
        kind: "tool_call",
        content: [
          {
            type: "tool_call",
            call_id: toolCallId,
            name: toolName,
            arguments: JSON.stringify(rawInput),
          },
        ],
      },
    },
  });

  return events;
}

function handleToolCallUpdateEvent(
  update: Record<string, unknown>,
  sequence: number
): AcpEvent[] {
  const toolCallId =
    typeof update.toolCallId === "string" ? update.toolCallId : "";
  if (!toolCallId) {
    return [];
  }

  const claudeCode = extractMeta(update);
  const toolResponse = toRecord(claudeCode.toolResponse);

  const outputText = extractToolCallOutput(update, toolResponse);
  if (outputText === null) {
    return [];
  }

  const resultId = `${toolCallId}-result`;

  return [
    {
      type: "item.started",
      sequence,
      data: {
        item: {
          item_id: resultId,
          kind: "tool_result",
          content: [
            {
              type: "tool_result",
              call_id: toolCallId,
              output: outputText,
            },
          ],
        },
      },
    },
    {
      type: "item.completed",
      sequence,
      data: { item: { item_id: resultId } },
    },
  ];
}

function extractTextParts(content: unknown[]): string {
  return content
    .map((contentPart) => {
      const contentPartRecord = toRecord(contentPart);
      return contentPartRecord && typeof contentPartRecord.text === "string"
        ? contentPartRecord.text
        : "";
    })
    .join("");
}

function extractNestedTextParts(content: unknown[]): string {
  return content
    .map((contentPart) => {
      const contentPartRecord = toRecord(contentPart);
      if (!contentPartRecord) {
        return "";
      }

      const nestedContent = toRecord(contentPartRecord.content);
      return nestedContent && typeof nestedContent.text === "string"
        ? nestedContent.text
        : "";
    })
    .join("");
}

function isTerminalToolStatus(status: unknown): boolean {
  return status === "failed" || status === "completed";
}

function extractToolCallOutput(
  update: Record<string, unknown>,
  toolResponse: Record<string, unknown> | null
): string | null {
  if (toolResponse) {
    const responseContent = Array.isArray(toolResponse.content)
      ? toolResponse.content
      : [];
    return extractTextParts(responseContent);
  }

  const rawOutput =
    typeof update.rawOutput === "string" ? update.rawOutput : undefined;
  if (rawOutput) {
    return rawOutput;
  }

  const content = Array.isArray(update.content) ? update.content : undefined;
  const outputText = Array.isArray(content)
    ? extractNestedTextParts(content)
    : "";
  if (outputText) {
    return outputText;
  }

  const status = typeof update.status === "string" ? update.status : undefined;
  return isTerminalToolStatus(status) ? "" : null;
}

function handleUserMessageEvent(
  update: Record<string, unknown>,
  sequence: number
): AcpEvent[] {
  const content = toRecord(update.content);
  const contentText =
    content && typeof content.text === "string" ? content.text : "";
  if (!contentText) {
    return [];
  }

  const itemId = `user-${sequence}-${Date.now()}`;
  return [
    {
      type: "item.started",
      sequence,
      data: {
        item: {
          item_id: itemId,
          kind: "message",
          role: "user",
          content: [{ type: "text", text: contentText }],
        },
      },
    },
    {
      type: "item.completed",
      sequence,
      data: { item: { item_id: itemId } },
    },
  ];
}

export function translateAcpEvent(
  parsed: Record<string, unknown>,
  sequence: number
): AcpEvent[] {
  const result = toRecord(parsed.result);
  if (result?.stopReason) {
    return finishTurn(sequence);
  }
  if (result) {
    return [];
  }

  const update = extractSessionUpdate(parsed);
  if (!update) {
    return [];
  }

  if (update.sessionUpdate === "agent_message_chunk") {
    const content = toRecord(update.content);
    if (!content) {
      return [];
    }
    const text = typeof content.text === "string" ? content.text : "";
    const type = typeof content.type === "string" ? content.type : "text";
    return handleMessageChunk({ text, type }, sequence);
  }

  if (update.sessionUpdate === "tool_call") {
    return handleToolCallEvent(update, sequence);
  }

  if (update.sessionUpdate === "tool_call_update") {
    return handleToolCallUpdateEvent(update, sequence);
  }

  if (update.sessionUpdate === "user_message") {
    return handleUserMessageEvent(update, sequence);
  }

  return [];
}

export function AcpSessionProvider({
  sessionId,
  children,
}: AcpSessionProviderProps) {
  const listenersRef = useRef<Set<EventListener>>(new Set());

  const subscribeRef = useRef((listener: EventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  });

  const publishRef = useRef((event: AcpEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  });

  return (
    <AcpSessionContext
      value={{
        sessionId,
        subscribe: subscribeRef.current,
        publish: publishRef.current,
      }}
    >
      {children}
    </AcpSessionContext>
  );
}

export function useAcpSession() {
  const context = useContext(AcpSessionContext);
  if (!context) {
    throw new Error("useAcpSession must be used within AcpSessionProvider");
  }
  return context;
}

export function createAcpEventParser(
  onEvent: (event: AcpEvent) => void
): ReturnType<typeof createParser> {
  return createParser({
    onEvent: (message) => {
      for (const event of parseSseMessage(message)) {
        onEvent(event);
      }
    },
  });
}
