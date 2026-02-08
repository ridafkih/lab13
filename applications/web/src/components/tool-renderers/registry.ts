import type { ComponentType } from "react";
import type { ToolRendererProps } from "./types";
import { BashRenderer } from "./renderers/bash";
import { ReadRenderer } from "./renderers/read";
import { WriteRenderer } from "./renderers/write";
import { EditRenderer } from "./renderers/edit";
import { GrepRenderer } from "./renderers/grep";
import { GlobRenderer } from "./renderers/glob";
import { WebFetchRenderer } from "./renderers/web-fetch";
import { TaskRenderer } from "./renderers/task";
import { TodoRenderer } from "./renderers/todo";
import { QuestionRenderer } from "./renderers/question";
import { FallbackRenderer } from "./renderers/fallback";

const toolRenderers: Record<string, ComponentType<ToolRendererProps>> = {
  bash: BashRenderer,
  read: ReadRenderer,
  write: WriteRenderer,
  edit: EditRenderer,
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

export function getToolRenderer(tool: string): ComponentType<ToolRendererProps> {
  const normalizedTool = tool.toLowerCase();
  return toolRenderers[normalizedTool] ?? FallbackRenderer;
}
