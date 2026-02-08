"use client";

import { ContentCode, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function BashRenderer({ input, output, error, status }: ToolRendererProps) {
  const command = getString(input, "command");
  const description = getString(input, "description");

  return (
    <div className="flex flex-col">
      {description && <div className="px-4 py-2 text-xs text-text-muted">{description}</div>}
      {command && (
        <div className="bg-bg-muted w-0 min-w-full">
          <ContentCode content={`$ ${command}`} language="bash" />
        </div>
      )}
      {output && status === "completed" && (
        <div className="w-0 min-w-full max-h-60 overflow-y-auto">
          <ContentCode content={output} language="bash" />
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

export { BashRenderer };
