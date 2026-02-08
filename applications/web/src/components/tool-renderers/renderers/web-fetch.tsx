"use client";

import { Globe } from "lucide-react";
import { ContentText, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function WebFetchRenderer({ input, output, error, status }: ToolRendererProps) {
  const url = getString(input, "url");
  const prompt = getString(input, "prompt");

  return (
    <div className="flex flex-col">
      {url && (
        <div className="px-4 py-2 flex items-center gap-1.5 bg-bg-muted">
          <Globe size={12} className="text-text-muted shrink-0" />
          <span className="text-xs truncate">{url}</span>
        </div>
      )}
      {prompt && (
        <div className="px-4 py-2 text-xs text-text-muted bg-bg-muted">&quot;{prompt}&quot;</div>
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

export { WebFetchRenderer };
