export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ToolCallContentPart {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "in_progress" | "completed" | "error";
}

export interface ToolResultContentPart {
  type: "tool_result";
  tool_call_id: string;
  output?: string;
  error?: string;
}

export interface ReasoningContentPart {
  type: "reasoning";
  text: string;
}

export interface FileRefContentPart {
  type: "file_ref";
  path: string;
  action?: string;
}

export interface ImageContentPart {
  type: "image";
  url: string;
  mime?: string;
  filename?: string;
}

export interface StatusContentPart {
  type: "status";
  text: string;
}

export type ContentPart =
  | TextContentPart
  | ToolCallContentPart
  | ToolResultContentPart
  | ReasoningContentPart
  | FileRefContentPart
  | ImageContentPart
  | StatusContentPart;

export interface AcpEvent {
  type: string;
  sequence: number;
  data: Record<string, unknown>;
}

export function isTextPart(part: ContentPart): part is TextContentPart {
  return part.type === "text";
}

export function isToolCallPart(part: ContentPart): part is ToolCallContentPart {
  return part.type === "tool_call";
}

export function isToolResultPart(
  part: ContentPart
): part is ToolResultContentPart {
  return part.type === "tool_result";
}

export function isReasoningPart(
  part: ContentPart
): part is ReasoningContentPart {
  return part.type === "reasoning";
}

export function isFileRefPart(part: ContentPart): part is FileRefContentPart {
  return part.type === "file_ref";
}

export function isImagePart(part: ContentPart): part is ImageContentPart {
  return part.type === "image";
}

export function isStatusPart(part: ContentPart): part is StatusContentPart {
  return part.type === "status";
}
