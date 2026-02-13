import type { InferenceStatus } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import { getChangeType } from "../types/file";

export function publishInferenceStatus(
  publisher: Publisher,
  sessionId: string,
  inferenceStatus: InferenceStatus,
  lastMessage?: string
): void {
  const delta: Record<string, string> = { inferenceStatus };
  if (lastMessage) {
    delta.lastMessage = lastMessage;
  }
  publisher.publishDelta("sessionMetadata", { uuid: sessionId }, delta);
}

export function publishSessionCompletion(
  publisher: Publisher,
  sessionId: string
): void {
  publisher.publishEvent(
    "sessionComplete",
    { uuid: sessionId },
    { sessionId, completedAt: Date.now() }
  );
}

export function publishFileRefDiff(
  publisher: Publisher,
  sessionId: string,
  filePath: string,
  originalContent: string,
  currentContent: string
): void {
  publisher.publishDelta(
    "sessionChangedFiles",
    { uuid: sessionId },
    {
      type: "add",
      file: {
        path: filePath,
        originalContent,
        currentContent,
        status: "pending" as const,
        changeType: getChangeType(originalContent, currentContent),
      },
    }
  );
}
