"use client";

import { Bot } from "lucide-react";
import { ContentText, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function TaskRenderer({ input, output, error, status }: ToolRendererProps) {
  const description = getString(input, "description");
  const prompt = getString(input, "prompt");
  const subagentType = getString(input, "subagent_type");

  return (
    <div className="flex flex-col">
      <div className="px-4 py-2 flex items-center gap-1.5 bg-bg-muted">
        <Bot size={12} className="text-text-muted shrink-0" />
        <span className="text-xs">{description ?? "Task"}</span>
        {subagentType && <span className="text-xs text-text-muted">({subagentType})</span>}
      </div>
      {prompt && (
        <div className="px-4 py-2 bg-bg-muted">
          <p className="text-xs text-text-muted line-clamp-3 border-l-2 border-border pl-2">
            {prompt}
          </p>
        </div>
      )}
      {output && status === "completed" && (
        <div className="px-4 py-2 bg-bg-muted w-0 min-w-full">
          <ContentText maxLines={15}>{output}</ContentText>
        </div>
      )}
      {error && (
        <div className="px-4 py-2 bg-bg-muted w-0 min-w-full">
          <ContentError>{error}</ContentError>
        </div>
      )}
    </div>
  );
}

export { TaskRenderer };
