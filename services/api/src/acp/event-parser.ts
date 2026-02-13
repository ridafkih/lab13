import type { AcpEvent } from "../types/dependencies";

export type ParsedEventType =
  | "turn.started"
  | "turn.ended"
  | "item.started"
  | "item.delta"
  | "item.completed"
  | "error"
  | "question.requested"
  | "question.resolved"
  | "permission.requested"
  | "permission.resolved"
  | "session.started"
  | "session.ended";

const KNOWN_TYPES = new Set<string>([
  "turn.started",
  "turn.ended",
  "item.started",
  "item.delta",
  "item.completed",
  "error",
  "question.requested",
  "question.resolved",
  "permission.requested",
  "permission.resolved",
  "session.started",
  "session.ended",
]);

export function isKnownEventType(type: string): type is ParsedEventType {
  return KNOWN_TYPES.has(type);
}

export function extractTextFromEvent(event: AcpEvent): string | null {
  const data = event.data;

  if (event.type === "item.delta" && typeof data.delta === "string") {
    return data.delta;
  }

  // item.delta: look for text content in deltas
  if (event.type === "item.delta" && Array.isArray(data.deltas)) {
    for (const delta of data.deltas) {
      if (
        typeof delta === "object" &&
        delta !== null &&
        delta.type === "text" &&
        typeof delta.text === "string"
      ) {
        return delta.text;
      }
    }
  }

  // item.started or item.completed: look for text in content
  if (Array.isArray(data.content)) {
    for (const part of data.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
    }
  }

  return null;
}

export function extractItemRole(event: AcpEvent): "user" | "assistant" | null {
  const role = event.data.role;
  if (role === "user" || role === "assistant") {
    return role;
  }
  return null;
}

export function extractItemId(event: AcpEvent): string | null {
  const id = event.data.id;
  return typeof id === "string" ? id : null;
}
