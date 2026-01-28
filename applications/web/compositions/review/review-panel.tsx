"use client";

import { useMemo } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { EmptyState } from "@lab/ui/components/empty-state";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { Check, File, FilePlus, FileX } from "lucide-react";
import type { ReviewableFile } from "@/types/review";

interface ReviewPanelProps {
  files: ReviewableFile[];
  onDismiss: (path: string) => void;
}

const changeTypeIcons = {
  modified: File,
  created: FilePlus,
  deleted: FileX,
};

const changeTypeColors = {
  modified: "text-warning",
  created: "text-success",
  deleted: "text-destructive",
};

export function ReviewPanel({ files, onDismiss }: ReviewPanelProps) {
  const pendingFiles = useMemo(() => files.filter((f) => f.status === "pending"), [files]);

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Check className="w-8 h-8 text-success" />}
          title="All caught up"
          description="No files to review"
        />
      </div>
    );
  }

  if (pendingFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Check className="w-8 h-8 text-success" />}
          title="All files reviewed"
          description="All files have been dismissed"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto">
        {pendingFiles.map((file) => {
          const Icon = changeTypeIcons[file.changeType];
          const oldFile: FileContents = {
            name: file.path,
            contents: file.changeType === "created" ? "" : file.originalContent,
          };
          const newFile: FileContents = {
            name: file.path,
            contents: file.changeType === "deleted" ? "" : file.currentContent,
          };

          return (
            <div key={file.path} className="border-b border-border">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border sticky top-0 bg-background z-10">
                <button
                  type="button"
                  onClick={() => onDismiss(file.path)}
                  className="w-3 h-3 flex-shrink-0 border border-muted-foreground flex items-center justify-center"
                ></button>
                <Icon className={cn("w-3 h-3 flex-shrink-0", changeTypeColors[file.changeType])} />
                <Copy size="xs" muted className="flex-1 truncate">
                  {file.path}
                </Copy>
              </div>
              <MultiFileDiff
                oldFile={oldFile}
                newFile={newFile}
                options={{
                  theme: "pierre-light",
                  diffStyle: "split",
                  hunkSeparators: "line-info",
                  lineDiffType: "word-alt",
                  overflow: "scroll",
                  disableFileHeader: true,
                  enableLineSelection: true,
                  unsafeCSS: `
                    * { user-select: none; }
                    [data-line] { position: relative; }
                    [data-column-number] { position: static; }
                    [data-column-number]::after {
                      content: "";
                      position: absolute;
                      top: 0;
                      left: 0;
                      right: 0;
                      bottom: 0;
                    }
                  `,
                }}
                style={
                  {
                    "--diffs-font-size": "13px",
                  } as React.CSSProperties
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
