"use client";

import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";

const pierreThemes = { light: "pierre-light", dark: "pierre-dark" } as const;

type ContentDiffProps = {
  oldContent: string;
  newContent: string;
  filename: string;
};

function ContentDiff({ oldContent, newContent, filename }: ContentDiffProps) {
  const oldFile: FileContents = {
    name: filename,
    contents: oldContent,
  };

  const newFile: FileContents = {
    name: filename,
    contents: newContent,
  };

  return (
    <div className="w-0 min-w-full">
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{
          theme: pierreThemes,
          themeType: "system",
          diffStyle: "split",
          hunkSeparators: "line-info",
          lineDiffType: "word-alt",
          overflow: "scroll",
          disableFileHeader: true,
        }}
        style={{ "--diffs-font-size": "12px", minWidth: 0 } as React.CSSProperties}
      />
    </div>
  );
}

export { ContentDiff };
