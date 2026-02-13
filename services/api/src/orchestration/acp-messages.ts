import { getAgentEvents } from "../repositories/agent-event.repository";
import type { AcpEvent } from "../types/dependencies";
import { MESSAGE_ROLE, type MessageRole } from "../types/message";

export interface ReconstructedMessage {
  role: MessageRole;
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === "text" && typeof value.text === "string";
}

function collectText(parts: unknown[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (isTextPart(part)) {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

interface ExtractionState {
  messages: ReconstructedMessage[];
  currentRole: MessageRole;
  currentText: string;
  inItem: boolean;
}

function flushCurrentItem(state: ExtractionState): void {
  if (state.inItem && state.currentText.trim()) {
    state.messages.push({
      role: state.currentRole,
      content: state.currentText.trim(),
    });
  }
}

function processExtractionEvent(event: AcpEvent, state: ExtractionState): void {
  if (event.type === "item.started") {
    flushCurrentItem(state);
    state.currentText = "";
    state.inItem = true;
    const role = event.data.role;
    state.currentRole =
      role === "user" ? MESSAGE_ROLE.USER : MESSAGE_ROLE.ASSISTANT;
    return;
  }

  if (event.type === "item.delta" && Array.isArray(event.data.deltas)) {
    state.currentText += collectText(event.data.deltas);
    return;
  }

  if (event.type === "item.completed" && Array.isArray(event.data.content)) {
    const itemText = collectText(event.data.content);
    if (itemText) {
      state.currentText = itemText;
    }
  }
}

export function extractTextFromEvents(
  events: AcpEvent[]
): ReconstructedMessage[] {
  const state: ExtractionState = {
    messages: [],
    currentRole: MESSAGE_ROLE.ASSISTANT,
    currentText: "",
    inItem: false,
  };

  for (const event of events) {
    processExtractionEvent(event, state);
  }

  flushCurrentItem(state);
  return state.messages;
}

function storedEventToSandboxEvent(stored: {
  sequence: number;
  eventData: unknown;
}): AcpEvent | null {
  if (!isRecord(stored.eventData)) {
    return null;
  }

  const method = stored.eventData.method;
  const params = stored.eventData.params;

  if (typeof method === "string" && isRecord(params)) {
    return {
      type: method,
      sequence: stored.sequence,
      data: params,
    };
  }

  return null;
}

export async function fetchSessionMessages(
  labSessionId: string
): Promise<ReconstructedMessage[]> {
  const storedEvents = await getAgentEvents(labSessionId);
  const events: AcpEvent[] = [];

  for (const stored of storedEvents) {
    const event = storedEventToSandboxEvent(stored);
    if (event) {
      events.push(event);
    }
  }

  return extractTextFromEvents(events);
}
