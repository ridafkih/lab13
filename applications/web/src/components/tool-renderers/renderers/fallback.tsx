"use client";

import { ContentError } from "../shared";
import type { ToolRendererProps } from "../types";

function flattenInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length > 100) {
      parts.push(`${key}: "${value.slice(0, 100)}..."`);
    } else if (typeof value === "object") {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.join(", ");
}

function FallbackRenderer({ input, output, error, status }: ToolRendererProps) {
  return (
    <div className="flex flex-col">
      {input && Object.keys(input).length > 0 && (
        <pre className="px-4 py-2 text-xs font-mono bg-bg-muted w-0 min-w-full whitespace-pre-wrap wrap-break-word">
          {flattenInput(input)}
        </pre>
      )}
      {output && status === "completed" && (
        <pre className="px-4 py-2 text-xs font-mono bg-bg-muted w-0 min-w-full whitespace-pre-wrap wrap-break-word max-h-40 overflow-y-auto">
          {output}
        </pre>
      )}
      {error && (
        <div className="px-4 py-2 bg-bg-muted w-0 min-w-full">
          <ContentError>{error}</ContentError>
        </div>
      )}
    </div>
  );
}

export { FallbackRenderer };
