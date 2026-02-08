"use client";

import { ContentDiff, ContentError, getString } from "../shared";
import type { ToolRendererProps } from "../types";

function EditRenderer({ input, error }: ToolRendererProps) {
  const filePath = getString(input, "filePath");
  const oldString = getString(input, "oldString") ?? "";
  const newString = getString(input, "newString") ?? "";

  return (
    <div className="flex flex-col">
      {(oldString || newString) && (
        <div className="w-0 min-w-full overflow-x-auto max-h-80 overflow-y-auto">
          <ContentDiff
            oldContent={oldString}
            newContent={newString}
            filename={filePath ?? "file"}
          />
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

export { EditRenderer };
