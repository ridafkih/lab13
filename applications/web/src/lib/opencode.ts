import type {
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
} from "@opencode-ai/sdk/v2/client";

export type SubtaskPart = Extract<Part, { type: "subtask" }>;

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

export function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === "reasoning";
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

export function isFilePart(part: Part): part is FilePart {
  return part.type === "file";
}

export function isStepStartPart(part: Part): part is StepStartPart {
  return part.type === "step-start";
}

export function isStepFinishPart(part: Part): part is StepFinishPart {
  return part.type === "step-finish";
}

export function isSnapshotPart(part: Part): part is SnapshotPart {
  return part.type === "snapshot";
}

export function isPatchPart(part: Part): part is PatchPart {
  return part.type === "patch";
}

export function isAgentPart(part: Part): part is AgentPart {
  return part.type === "agent";
}

export function isSubtaskPart(part: Part): part is SubtaskPart {
  return part.type === "subtask";
}

export function isRetryPart(part: Part): part is RetryPart {
  return part.type === "retry";
}

export function isCompactionPart(part: Part): part is CompactionPart {
  return part.type === "compaction";
}
