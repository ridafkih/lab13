"use client";

import {
  createContext,
  use,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from "react";
import { tv } from "tailwind-variants";
import { MultiFileDiff, File as FileViewer } from "@pierre/diffs/react";
import type { FileContents, SelectedLineRange } from "@pierre/diffs";
import { File, FilePlus, FileX, Folder, X, Check, ChevronRight, Loader2 } from "lucide-react";
import { Button, button } from "@/components/button";
import { TextAreaGroup } from "./textarea-group";
import { cn } from "@/lib/cn";

interface DiffStyleProps extends CSSProperties {
  "--diffs-font-size"?: string;
}

type FileChangeType = "modified" | "created" | "deleted";
type ReviewStatus = "pending" | "dismissed";
type FileStatus = "added" | "modified" | "deleted";

type ReviewableFile = {
  path: string;
  originalContent: string;
  currentContent: string;
  status: ReviewStatus;
  changeType: FileChangeType;
};

type LineSelection = {
  filePath: string;
  range: SelectedLineRange;
};

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  ignored?: boolean;
};

type PatchHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

type Patch = {
  oldFileName: string;
  newFileName: string;
  hunks: PatchHunk[];
};

type BrowserState = {
  rootNodes: FileNode[];
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  loadingPaths: Set<string>;
  rootLoading: boolean;
  selectedPath: string | null;
  previewContent: string | null;
  previewPatch: Patch | null;
  previewLoading: boolean;
  fileStatuses: Map<string, FileStatus>;
  directoriesWithChanges: Set<string>;
};

type BrowserActions = {
  toggleDirectory: (path: string) => void;
  selectFile: (path: string) => void;
  clearFileSelection: () => void;
  expandToFile: (path: string) => Promise<void>;
};

type ReviewState = {
  files: ReviewableFile[];
  pendingFiles: ReviewableFile[];
  selection: LineSelection | null;
  view: "diff" | "preview";
  browser: BrowserState;
};

type ReviewActions = {
  dismissFile: (path: string) => void;
  selectLines: (filePath: string, range: SelectedLineRange | null) => void;
  clearSelection: () => void;
  submitFeedback: (feedback: string) => void;
  browser: BrowserActions;
};

type ReviewMeta = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  prevSelectionRef: RefObject<LineSelection | null>;
};

type ReviewContextValue = {
  state: ReviewState;
  actions: ReviewActions;
  meta: ReviewMeta;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

function useReview() {
  const context = use(ReviewContext);
  if (!context) {
    throw new Error("Review components must be used within Review.Provider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
  files: ReviewableFile[];
  onDismiss: (path: string) => void;
  onSubmitFeedback?: (selection: LineSelection, feedback: string) => void;
  browser?: {
    state: BrowserState;
    actions: BrowserActions;
  };
};

function ReviewProvider({ children, files, onDismiss, onSubmitFeedback, browser }: ProviderProps) {
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevSelectionRef = useRef<LineSelection | null>(null);

  const pendingFiles = files.filter((file) => file.status === "pending");

  useEffect(() => {
    if (selection) {
      textareaRef.current?.focus();
    }
    prevSelectionRef.current = selection;
  }, [selection]);

  const selectLines = (filePath: string, range: SelectedLineRange | null) => {
    if (range) {
      setSelection({ filePath, range });
    } else {
      setSelection((prev) => (prev?.filePath === filePath ? null : prev));
    }
  };

  const clearSelection = () => {
    setSelection(null);
  };

  const submitFeedback = (feedback: string) => {
    if (selection && onSubmitFeedback) {
      onSubmitFeedback(selection, feedback);
    }
    clearSelection();
  };

  const defaultBrowserState: BrowserState = {
    rootNodes: [],
    expandedPaths: new Set(),
    loadedContents: new Map(),
    loadingPaths: new Set(),
    rootLoading: false,
    selectedPath: null,
    previewContent: null,
    previewPatch: null,
    previewLoading: false,
    fileStatuses: new Map(),
    directoriesWithChanges: new Set(),
  };

  const defaultBrowserActions: BrowserActions = {
    toggleDirectory: () => {},
    selectFile: () => {},
    clearFileSelection: () => {},
    expandToFile: async () => {},
  };

  const view = browser?.state.selectedPath ? "preview" : "diff";

  const state: ReviewState = {
    files,
    pendingFiles,
    selection,
    view,
    browser: browser?.state ?? defaultBrowserState,
  };

  const actions: ReviewActions = {
    dismissFile: onDismiss,
    selectLines,
    clearSelection,
    submitFeedback,
    browser: browser?.actions ?? defaultBrowserActions,
  };

  const meta: ReviewMeta = { textareaRef, prevSelectionRef };

  const value = { state, actions, meta };

  return <ReviewContext value={value}>{children}</ReviewContext>;
}

function ReviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] grid-rows-[auto_1fr_auto] flex-1 min-h-0 min-w-0">
      {children}
    </div>
  );
}

function ReviewMainPanel({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}

function ReviewSidePanel({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((prev) => !prev);

  return (
    <SidePanelContext value={{ collapsed, toggle }}>
      <div className="contents">{children}</div>
    </SidePanelContext>
  );
}

const emptyState = tv({
  base: "col-start-1 row-start-1 row-span-2 flex flex-col items-center justify-center gap-2 text-center",
});

function ReviewEmpty() {
  const { state } = useReview();

  if (state.view === "preview") return null;
  if (state.selection) return null;

  if (state.files.length === 0) {
    return (
      <div className={emptyState()}>
        <span className="text-sm text-text-muted">No files to review</span>
      </div>
    );
  }

  if (state.pendingFiles.length === 0) {
    return (
      <div className={emptyState()}>
        <Check className="size-8 text-green-500" />
        <span className="text-sm text-text-muted">All files reviewed</span>
      </div>
    );
  }

  return null;
}

function ReviewDiffView({ children }: { children: ReactNode }) {
  const { state } = useReview();
  if (state.view !== "diff") return null;
  if (state.pendingFiles.length === 0 && !state.selection) return null;
  return <div className="contents">{children}</div>;
}

function ReviewDiffHeader({ children }: { children?: ReactNode }) {
  return (
    <div className="col-start-1 row-start-1 flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
      <span className="flex-1 text-xs text-text-muted">{children ?? "Changes"}</span>
      <span className={button({ variant: "ghost", size: "sm", className: "invisible" })}>
        Close
      </span>
    </div>
  );
}

const diffList = tv({
  base: "col-start-1 row-start-2 overflow-auto min-w-0 min-h-0",
});

function ReviewDiffList({ children }: { children: ReactNode }) {
  return <div className={diffList()}>{children}</div>;
}

type DiffItemContextValue = {
  file: ReviewableFile;
};

const DiffItemContext = createContext<DiffItemContextValue | null>(null);

function useDiffItem() {
  const context = use(DiffItemContext);
  if (!context) {
    throw new Error("DiffItem components must be used within Review.DiffItem");
  }
  return context;
}

function ReviewDiffItem({ file, children }: { file: ReviewableFile; children: ReactNode }) {
  return (
    <DiffItemContext value={{ file }}>
      <div className="border-b border-border min-w-0">{children}</div>
    </DiffItemContext>
  );
}

const DIFF_CSS = `
  * { user-select: none; }
  [data-line] { position: relative; }
  [data-column-number] { position: static; cursor: crosshair; }
  [data-column-number]::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
`;

const pierreThemes = { light: "pierre-light", dark: "pierre-dark" } as const;

function ReviewDiff() {
  const { state, actions, meta } = useReview();
  const { file } = useDiffItem();

  const oldFile: FileContents = {
    name: file.path,
    contents: file.changeType === "created" ? "" : file.originalContent,
  };

  const newFile: FileContents = {
    name: file.path,
    contents: file.changeType === "deleted" ? "" : file.currentContent,
  };

  const shouldClearSelection =
    meta.prevSelectionRef.current?.filePath === file.path &&
    state.selection?.filePath !== file.path;

  const diffStyle: DiffStyleProps = { "--diffs-font-size": "12px", minWidth: 0 };

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      selectedLines={shouldClearSelection ? null : undefined}
      options={{
        theme: pierreThemes,
        themeType: "system",
        diffStyle: "split",
        hunkSeparators: "line-info",
        lineDiffType: "word-alt",
        overflow: "scroll",
        disableFileHeader: true,
        enableLineSelection: true,
        onLineSelected: (range) => actions.selectLines(file.path, range),
        unsafeCSS: DIFF_CSS,
      }}
      style={diffStyle}
    />
  );
}

type FileHeaderContextValue = {
  path: string;
  changeType: FileChangeType;
};

const FileHeaderContext = createContext<FileHeaderContextValue | null>(null);

function useFileHeader() {
  const context = use(FileHeaderContext);
  if (!context) {
    throw new Error("FileHeader components must be used within Review.FileHeader");
  }
  return context;
}

const fileHeader = tv({
  base: "flex items-center gap-1.5 px-2 py-1.5 border-b border-border sticky top-0 bg-bg z-10",
});

function ReviewFileHeader({ children }: { children: ReactNode }) {
  const { file } = useDiffItem();

  return (
    <FileHeaderContext value={{ path: file.path, changeType: file.changeType }}>
      <div className={fileHeader()}>{children}</div>
    </FileHeaderContext>
  );
}

const iconVariants = tv({
  base: "size-3 shrink-0",
  variants: {
    changeType: {
      modified: "text-yellow-500",
      created: "text-green-500",
      deleted: "text-red-500",
    },
  },
});

function ReviewFileHeaderIcon() {
  const { changeType } = useFileHeader();
  const icons = { modified: File, created: FilePlus, deleted: FileX };
  const Icon = icons[changeType];
  return <Icon className={iconVariants({ changeType })} />;
}

function ReviewFileHeaderLabel() {
  const { path } = useFileHeader();
  return <span className="flex-1 truncate text-xs text-text-muted ">{path}</span>;
}

function ReviewFileHeaderDismiss() {
  const { actions } = useReview();
  const { path } = useFileHeader();

  return (
    <Button variant="ghost" size="sm" onClick={() => actions.dismissFile(path)}>
      Dismiss
    </Button>
  );
}

const feedback = tv({
  base: "col-start-1 row-start-3 border-t border-border",
});

function ReviewFeedback({ children }: { children: ReactNode }) {
  const { state, actions, meta } = useReview();

  useEffect(() => {
    if (!state.selection && meta.textareaRef.current) {
      meta.textareaRef.current.value = "";
    }
  }, [state.selection, meta.textareaRef]);

  if (!state.selection) return null;

  const handleSubmit = () => {
    const feedback = meta.textareaRef.current?.value ?? "";
    actions.submitFeedback(feedback);
  };

  return (
    <TextAreaGroup.Provider
      state={{}}
      actions={{ onSubmit: handleSubmit }}
      meta={{ textareaRef: meta.textareaRef }}
    >
      <div className={feedback()}>{children}</div>
    </TextAreaGroup.Provider>
  );
}

const feedbackHeader = tv({
  base: "flex items-center gap-1.5 px-2 py-1 border-b border-border bg-bg-muted",
});

function ReviewFeedbackHeader({ children }: { children?: ReactNode }) {
  const { actions } = useReview();

  return (
    <div className={feedbackHeader()}>
      {children}
      <span className="flex-1" />
      <button type="button" onClick={actions.clearSelection} className="p-0.5 hover:bg-bg">
        <X className="size-3 text-text-muted" />
      </button>
    </div>
  );
}

function ReviewFeedbackLocation() {
  const { state } = useReview();
  if (!state.selection) return null;

  const { filePath, range } = state.selection;
  const lineText = range.end !== range.start ? `L${range.start}-${range.end}` : `L${range.start}`;

  return (
    <span className="text-xs  text-text-muted">
      {filePath} {lineText}
    </span>
  );
}

function ReviewPreviewView({ children }: { children?: ReactNode }) {
  const { state } = useReview();
  if (state.view !== "preview") return null;

  if (state.browser.previewLoading) {
    return (
      <div className="col-start-1 row-span-2 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!state.browser.previewContent) {
    return (
      <div className="col-start-1 row-span-2 flex items-center justify-center text-text-muted text-sm">
        Unable to load file
      </div>
    );
  }

  return <div className="contents">{children}</div>;
}

function ReviewPreviewHeader({ children }: { children?: ReactNode }) {
  const { state, actions } = useReview();
  const isVisible = state.view === "preview" && !!state.browser.selectedPath;

  return (
    <div
      className={fileHeader({ className: "col-start-1 row-start-1" })}
      style={{ visibility: isVisible ? "visible" : "hidden" }}
    >
      <span className="flex-1 truncate text-xs text-text-muted ">
        {state.browser.selectedPath ?? "\u00A0"}
      </span>
      {children}
      <Button variant="ghost" size="sm" onClick={actions.browser.clearFileSelection}>
        Close
      </Button>
    </div>
  );
}

function reconstructOldContent(newContent: string, patch: Patch): string {
  const newLines = newContent.split("\n");
  const oldLines: string[] = [];
  let newLineIndex = 0;

  for (const hunk of patch.hunks) {
    while (newLineIndex < hunk.newStart - 1) {
      oldLines.push(newLines[newLineIndex]!);
      newLineIndex++;
    }

    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.slice(1);

      if (prefix === "-") {
        oldLines.push(content);
      } else if (prefix === "+") {
      } else {
        oldLines.push(newLines[newLineIndex]);
      }

      if (prefix !== "-") {
        newLineIndex++;
      }
    }
  }

  while (newLineIndex < newLines.length) {
    oldLines.push(newLines[newLineIndex]!);
    newLineIndex++;
  }

  return oldLines.join("\n");
}

function ReviewPreviewContent() {
  const { state, actions, meta } = useReview();

  if (!state.browser.selectedPath || !state.browser.previewContent) return null;

  const shouldClearSelection =
    meta.prevSelectionRef.current?.filePath === state.browser.selectedPath &&
    state.selection?.filePath !== state.browser.selectedPath;

  const patch = state.browser.previewPatch;
  const hasChanges = patch && patch.hunks && patch.hunks.length > 0;

  if (hasChanges) {
    const oldContent = reconstructOldContent(state.browser.previewContent, patch);

    const oldFile: FileContents = {
      name: state.browser.selectedPath,
      contents: oldContent,
    };

    const newFile: FileContents = {
      name: state.browser.selectedPath,
      contents: state.browser.previewContent,
    };

    const diffStyle: DiffStyleProps = { "--diffs-font-size": "12px", minWidth: 0 };

    return (
      <div className="col-start-1 row-start-2 overflow-auto min-w-0 min-h-0">
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          selectedLines={shouldClearSelection ? null : undefined}
          options={{
            theme: pierreThemes,
            themeType: "system",
            diffStyle: "split",
            hunkSeparators: "line-info",
            lineDiffType: "word-alt",
            overflow: "scroll",
            disableFileHeader: true,
            enableLineSelection: true,
            onLineSelected: (range) => actions.selectLines(state.browser.selectedPath!, range),
            unsafeCSS: DIFF_CSS,
          }}
          style={diffStyle}
        />
      </div>
    );
  }

  const previewFile: FileContents = {
    name: state.browser.selectedPath,
    contents: state.browser.previewContent,
  };

  const fileStyle: DiffStyleProps = { "--diffs-font-size": "12px", minWidth: 0 };

  return (
    <div className="col-start-1 row-start-2 overflow-auto min-w-0 min-h-0">
      <FileViewer
        file={previewFile}
        selectedLines={shouldClearSelection ? null : undefined}
        options={{
          theme: pierreThemes,
          themeType: "system",
          overflow: "scroll",
          disableFileHeader: true,
          enableLineSelection: true,
          onLineSelected: (range) => actions.selectLines(state.browser.selectedPath!, range),
          unsafeCSS: DIFF_CSS,
        }}
        style={fileStyle}
      />
    </div>
  );
}

type SidePanelContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

function useSidePanel() {
  const context = use(SidePanelContext);
  if (!context) {
    throw new Error("SidePanel components must be used within Review.SidePanel");
  }
  return context;
}

function ReviewBrowser({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidePanel();

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={toggle}
          className="col-start-2 row-start-1 flex items-center justify-center w-8 px-2 py-1.5 border-l border-b border-border hover:bg-bg-muted"
          aria-label="Expand files panel"
        >
          <ChevronRight className="size-3 text-text-muted rotate-180" />
        </button>
        <div className="col-start-2 row-start-2 w-8 border-l border-border" />
      </>
    );
  }

  return <div className="contents">{children}</div>;
}

function ReviewBrowserHeader({ children }: { children?: ReactNode }) {
  const { toggle } = useSidePanel();

  return (
    <button
      type="button"
      onClick={toggle}
      className="col-start-2 row-start-1 flex items-center gap-1 min-w-56 px-2 py-1.5 border-l border-b border-border text-left hover:bg-bg-muted"
    >
      <ChevronRight className="size-3 text-text-muted" />
      <span className="text-xs text-text-muted">{children ?? "Files"}</span>
    </button>
  );
}

function ReviewBrowserTree() {
  const { state } = useReview();

  if (state.browser.rootLoading) {
    return (
      <div className="col-start-2 row-start-2 flex items-center justify-center p-4 min-w-56 border-l border-border">
        <Loader2 className="size-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (state.browser.rootNodes.length === 0) {
    return (
      <div className="col-start-2 row-start-2 flex items-center justify-center p-4 min-w-56 border-l border-border text-text-muted text-xs">
        No files found
      </div>
    );
  }

  return (
    <div className="col-start-2 row-start-2 row-span-2 min-w-56 border-l border-border overflow-auto">
      <TreeNodes nodes={state.browser.rootNodes} depth={0} />
    </div>
  );
}

const fileStatusColors = {
  added: "text-emerald-500",
  modified: "text-amber-500",
  deleted: "text-rose-500",
} as const;

function TreeNodes({ nodes, depth }: { nodes: FileNode[]; depth: number }) {
  const { state, actions } = useReview();

  return (
    <div className="flex flex-col">
      {nodes.map((node) => {
        const isExpanded = state.browser.expandedPaths.has(node.path);
        const isLoading = state.browser.loadingPaths.has(node.path);
        const isSelected = state.browser.selectedPath === node.path;
        const children = state.browser.loadedContents.get(node.path) ?? [];
        const isDirectory = node.type === "directory";
        const fileStatus = state.browser.fileStatuses.get(node.path);
        const isIgnored = node.ignored === true;
        const hasChanges = isDirectory && state.browser.directoriesWithChanges.has(node.path);

        const handleClick = () => {
          if (isDirectory) {
            actions.browser.toggleDirectory(node.path);
          } else {
            actions.clearSelection();
            actions.browser.selectFile(node.path);
          }
        };

        const FileIcon =
          fileStatus === "added" ? FilePlus : fileStatus === "deleted" ? FileX : File;

        const getFileIconColor = () => {
          if (isIgnored) return "text-text-muted/80";
          if (fileStatus) return fileStatusColors[fileStatus];
          return "text-text-muted";
        };

        const getFolderColor = () => {
          if (isIgnored) return "text-text-muted/80";
          if (hasChanges) return fileStatusColors.modified;
          return "text-text-muted";
        };

        const getTextColor = () => {
          if (isIgnored) return "text-text-muted/80";
          if (fileStatus) return fileStatusColors[fileStatus];
          if (hasChanges) return fileStatusColors.modified;
          return undefined;
        };

        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={handleClick}
              className={cn(
                "flex items-center gap-1 w-full px-2 py-0.5 text-left text-text-muted hover:bg-bg-muted",
                isSelected && "bg-bg-muted",
                isIgnored && "opacity-80",
              )}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isDirectory && (
                <span className="grid size-3 place-items-center">
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ChevronRight className={cn("size-3", isExpanded && "rotate-90")} />
                  )}
                </span>
              )}
              {!isDirectory && <span className="size-3" />}
              {isDirectory ? (
                <Folder className={cn("size-3", getFolderColor())} />
              ) : (
                <FileIcon className={cn("size-3", getFileIconColor())} />
              )}
              <span className={cn("flex-1 truncate text-xs", getTextColor())}>{node.name}</span>
            </button>
            {isDirectory && isExpanded && children.length > 0 && (
              <TreeNodes nodes={children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const Review = {
  Provider: ReviewProvider,
  Frame: ReviewFrame,
  MainPanel: ReviewMainPanel,
  SidePanel: ReviewSidePanel,
  Empty: ReviewEmpty,
  DiffView: ReviewDiffView,
  DiffHeader: ReviewDiffHeader,
  DiffList: ReviewDiffList,
  DiffItem: ReviewDiffItem,
  Diff: ReviewDiff,
  FileHeader: ReviewFileHeader,
  FileHeaderIcon: ReviewFileHeaderIcon,
  FileHeaderLabel: ReviewFileHeaderLabel,
  FileHeaderDismiss: ReviewFileHeaderDismiss,
  Feedback: ReviewFeedback,
  FeedbackHeader: ReviewFeedbackHeader,
  FeedbackLocation: ReviewFeedbackLocation,
  PreviewView: ReviewPreviewView,
  PreviewHeader: ReviewPreviewHeader,
  PreviewContent: ReviewPreviewContent,
  Browser: ReviewBrowser,
  BrowserHeader: ReviewBrowserHeader,
  BrowserTree: ReviewBrowserTree,
};

export { Review, type FileStatus, type FileNode, type BrowserState, type BrowserActions };
