import type { ComponentType } from "react";
import { BashRenderer } from "./renderers/bash";
import { EditRenderer } from "./renderers/edit";
import { FallbackRenderer } from "./renderers/fallback";
import { GlobRenderer } from "./renderers/glob";
import { GrepRenderer } from "./renderers/grep";
import { QuestionRenderer } from "./renderers/question";
import { ReadRenderer } from "./renderers/read";
import { TaskRenderer } from "./renderers/task";
import { TodoRenderer } from "./renderers/todo";
import { WebFetchRenderer } from "./renderers/web-fetch";
import { WriteRenderer } from "./renderers/write";
import type { ToolRendererProps } from "./types";

const toolRenderers: Record<string, ComponentType<ToolRendererProps>> = {
  bash: BashRenderer,
  read: ReadRenderer,
  write: WriteRenderer,
  edit: EditRenderer,
  patch: EditRenderer,
  grep: GrepRenderer,
  glob: GlobRenderer,
  webfetch: WebFetchRenderer,
  task: TaskRenderer,
  todowrite: TodoRenderer,
  taskcreate: TodoRenderer,
  taskupdate: TodoRenderer,
  askuserquestion: QuestionRenderer,
  question: QuestionRenderer,
};

function normalizeTool(tool: string): string {
  const lower = tool.toLowerCase().trim();
  const withoutScope = lower.includes("__")
    ? (lower.split("__").at(-1) ?? lower)
    : lower;
  return withoutScope.replace(/[^a-z0-9]/g, "");
}

export function getToolRenderer(
  tool: string
): ComponentType<ToolRendererProps> {
  const normalizedTool = normalizeTool(tool);
  return toolRenderers[normalizedTool] ?? FallbackRenderer;
}
