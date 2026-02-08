"use client";

import { ContentCode, ContentError, parseFileOutput, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function ReadRenderer({ input, output, error, status }: ToolRendererProps) {
  const filePath = getString(input, "filePath");

  const parsedContent = output ? parseFileOutput(output) : null;

  return (
    <div className="flex flex-col">
      {parsedContent && status === "completed" && (
        <div className="w-0 min-w-full overflow-x-auto max-h-80 overflow-y-auto">
          <ContentCode content={parsedContent} filename={filePath} />
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

export { ReadRenderer };
