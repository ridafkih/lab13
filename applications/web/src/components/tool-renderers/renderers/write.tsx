"use client";

import { ContentCode, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function WriteRenderer({ input, error }: ToolRendererProps) {
  const filePath = getString(input, "filePath");
  const content = getString(input, "content");

  return (
    <div className="flex flex-col">
      {content && (
        <div className="w-0 min-w-full overflow-x-auto max-h-80 overflow-y-auto">
          <ContentCode content={content} filename={filePath} />
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

export { WriteRenderer };
