"use client";

import { useState } from "react";

type ContentErrorProps = {
  children: string;
  maxLines?: number;
};

function ContentError({ children, maxLines = 5 }: ContentErrorProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = children.split("\n");
  const totalLines = lines.length;
  const needsTruncation = totalLines > maxLines;
  const visibleLines = expanded || !needsTruncation ? lines : lines.slice(0, maxLines);
  const hiddenCount = totalLines - maxLines;

  return (
    <div className="flex flex-col gap-1 text-red-500">
      <pre className="text-xs font-mono whitespace-pre-wrap wrap-break-word">
        {expanded || !needsTruncation ? children : visibleLines.join("\n")}
      </pre>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="self-start text-xs text-red-400 hover:text-red-300"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more lines`}
        </button>
      )}
    </div>
  );
}

export { ContentError };
