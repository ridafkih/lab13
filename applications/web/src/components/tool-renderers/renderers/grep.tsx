"use client";

import { useState } from "react";
import { ResultsToggle, ContentText, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function GrepRenderer({ input, output, error, status }: ToolRendererProps) {
  const [expanded, setExpanded] = useState(false);

  const pattern = getString(input, "pattern");
  const path = getString(input, "path");
  const glob = getString(input, "glob");

  const resultCount = output ? output.split("\n").filter((line) => line.trim()).length : 0;

  return (
    <div className="flex flex-col">
      <div className="px-4 py-2 flex flex-col gap-1 bg-bg-muted">
        {pattern && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">Pattern:</span>
            <code className="font-mono">{pattern}</code>
          </div>
        )}
        {path && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">in:</span>
            <span>{path}</span>
          </div>
        )}
        {glob && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">glob:</span>
            <code className="font-mono">{glob}</code>
          </div>
        )}
      </div>
      {output && status === "completed" && (
        <div className="px-4 py-2 bg-bg-muted">
          <ResultsToggle
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            label="Results"
            count={resultCount}
          />
          {expanded && (
            <div className="mt-2">
              <ContentText maxLines={20}>{output}</ContentText>
            </div>
          )}
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

export { GrepRenderer };
