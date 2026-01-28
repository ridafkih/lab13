"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Button } from "@lab/ui/components/button";
import { EmptyState } from "@lab/ui/components/empty-state";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents, SelectedLineRange } from "@pierre/diffs";
import { Check, File, FilePlus, FileX, Send, X } from "lucide-react";
import type { ReviewableFile } from "@/types/review";

interface ReviewPanelProps {
  files: ReviewableFile[];
  onDismiss: (path: string) => void;
}

interface LineSelection {
  filePath: string;
  range: SelectedLineRange;
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
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const prevSelectionRef = useRef<LineSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingFiles = useMemo(() => files.filter((f) => f.status === "pending"), [files]);

  useEffect(() => {
    if (selection) {
      textareaRef.current?.focus();
    }
    prevSelectionRef.current = selection;
  }, [selection]);

  const handleLineSelected = useCallback((filePath: string, range: SelectedLineRange | null) => {
    if (range) {
      setSelection({ filePath, range });
    } else {
      setSelection((prev) => (prev?.filePath === filePath ? null : prev));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

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
          const shouldClearSelection =
            prevSelectionRef.current?.filePath === file.path && selection?.filePath !== file.path;

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
                selectedLines={shouldClearSelection ? null : undefined}
                options={{
                  theme: "pierre-light",
                  diffStyle: "split",
                  hunkSeparators: "line-info",
                  lineDiffType: "word-alt",
                  overflow: "scroll",
                  disableFileHeader: true,
                  enableLineSelection: true,
                  onLineSelected: (range) => handleLineSelected(file.path, range),
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
                    "--diffs-font-size": "12px",
                  } as React.CSSProperties
                }
              />
            </div>
          );
        })}
      </div>

      {selection && (
        <div className="border-t border-border">
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border bg-muted/50">
            <Copy size="xs" muted>
              {selection.filePath} L{selection.range.start}
              {selection.range.end !== selection.range.start && `-${selection.range.end}`}
            </Copy>
            <span className="flex-1" />
            <button type="button" onClick={clearSelection} className="p-0.5 hover:bg-muted">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <label className="flex flex-col bg-background cursor-text">
            <textarea
              ref={textareaRef}
              placeholder="Provide feedback on this selection..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-end px-1.5 pb-1.5">
              <Button variant="primary" icon={<Send className="w-3 h-3" />}>
                Send
              </Button>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
