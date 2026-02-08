"use client";

import { useState } from "react";

type ContentTextProps = {
  children: string;
  maxLines?: number;
  collapsible?: boolean;
};

function ContentText({ children, maxLines = 10, collapsible = true }: ContentTextProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = children.split("\n");
  const totalLines = lines.length;
  const needsTruncation = collapsible && totalLines > maxLines;
  const visibleLines = expanded || !needsTruncation ? lines : lines.slice(0, maxLines);
  const hiddenCount = totalLines - maxLines;

  return (
    <div className="flex flex-col gap-1">
      <pre className="text-xs font-mono whitespace-pre-wrap wrap-break-word">
        {visibleLines.join("\n")}
      </pre>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="self-start text-xs text-text-muted hover:text-text-secondary"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more lines`}
        </button>
      )}
    </div>
  );
}

export { ContentText };
