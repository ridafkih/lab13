"use client";

import { createContext, use, useState, memo, type ReactNode } from "react";
import type {
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  SnapshotPart,
} from "@opencode-ai/sdk/v2/client";
import { Check, ChevronRight, Loader2, File, FilePlus, FileEdit } from "lucide-react";
import { tv } from "tailwind-variants";
import { Markdown } from "./markdown";
import { cn } from "@/lib/cn";
import { getToolRenderer } from "@/components/tool-renderers";
import {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isFilePart,
  isStepStartPart,
  isStepFinishPart,
  isSnapshotPart,
  isPatchPart,
  isAgentPart,
  isSubtaskPart,
  isRetryPart,
  isCompactionPart,
  type SubtaskPart,
} from "@/lib/opencode";

const contentBlock = tv({
  base: "px-4 py-3 text-sm",
});

function MessagePartText({ part, isStreaming }: { part: TextPart; isStreaming?: boolean }) {
  if (part.text.trim().length === 0) return null;

  return (
    <div className={contentBlock()} data-opencode-component="Text">
      <Markdown isStreaming={isStreaming}>{part.text}</Markdown>
    </div>
  );
}

type ReasoningContextValue = {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ReasoningPart };
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within MessagePart.Reasoning");
  }
  return context;
}

function MessagePartReasoning({ part, children }: { part: ReasoningPart; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  if (part.text.trim().length === 0) return null;

  return (
    <ReasoningContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part },
      }}
    >
      <div data-opencode-component="Reasoning">{children}</div>
    </ReasoningContext>
  );
}

function MessagePartReasoningHeader({ children }: { children: ReactNode }) {
  const { actions } = useReasoning();

  return (
    <button
      type="button"
      onClick={actions.toggle}
      className="flex items-center gap-1.5 w-full px-3 py-1 text-xs cursor-pointer hover:bg-bg-hover"
    >
      {children}
    </button>
  );
}

function MessagePartReasoningChevron() {
  const { state } = useReasoning();
  return (
    <ChevronRight
      size={12}
      className={cn("shrink-0 text-text-muted", state.expanded && "rotate-90")}
    />
  );
}

function MessagePartReasoningPreview() {
  const { state, meta } = useReasoning();
  if (state.expanded) return null;
  return (
    <span className="flex-1 truncate text-text-muted whitespace-nowrap italic text-right overflow-hidden">
      {meta.part.text}
    </span>
  );
}

function MessagePartReasoningContent() {
  const { state, meta } = useReasoning();
  if (!state.expanded) return null;
  return (
    <div className={cn(contentBlock(), "text-text-muted")}>
      <Markdown>{meta.part.text}</Markdown>
    </div>
  );
}

const actionRow = tv({
  base: "flex items-center gap-2 px-4 py-2 text-sm",
});

const toolStatus = tv({
  base: "",
  variants: {
    status: {
      pending: "text-text-muted",
      running: "text-text-muted animate-spin",
      completed: "text-green-500",
      error: "text-red-500",
    },
  },
});

type ToolContextValue = {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ToolPart };
};

const ToolContext = createContext<ToolContextValue | null>(null);

function useTool() {
  const context = use(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within MessagePart.Tool");
  }
  return context;
}

interface MessagePartToolProps {
  part: ToolPart;
  children: ReactNode;
  defaultExpanded?: boolean;
}

function MessagePartTool({ part, children, defaultExpanded = false }: MessagePartToolProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <ToolContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part },
      }}
    >
      <div data-opencode-component="Tool">{children}</div>
    </ToolContext>
  );
}

const fileToolIcons = {
  edit: { icon: FileEdit, color: "text-yellow-500" },
  write: { icon: FilePlus, color: "text-green-500" },
  read: { icon: File, color: "text-text-muted" },
} as const;

function MessagePartToolStatus() {
  const { meta } = useTool();
  const status = meta.part.state.status;
  const toolName = meta.part.tool;

  const fileToolConfig = fileToolIcons[toolName as keyof typeof fileToolIcons];

  if (status === "running" || status === "pending") {
    if (fileToolConfig) {
      const Icon = fileToolConfig.icon;
      return <Icon size={12} className={cn("shrink-0 animate-pulse", fileToolConfig.color)} />;
    }
    return <Loader2 size={12} className={cn("shrink-0", toolStatus({ status: "running" }))} />;
  }
  if (status === "completed") {
    if (fileToolConfig) {
      const Icon = fileToolConfig.icon;
      return <Icon size={12} className={cn("shrink-0", fileToolConfig.color)} />;
    }
    return <Check size={12} className={cn("shrink-0", toolStatus({ status }))} />;
  }
  if (status === "error") {
    return <span className={cn("shrink-0", toolStatus({ status }))}>✕</span>;
  }
  return null;
}

function MessagePartToolName() {
  const { meta } = useTool();
  return <span className="text-text-secondary">{meta.part.tool}</span>;
}

function getString(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function MessagePartToolPath() {
  const { meta } = useTool();
  const input = meta.part.state.input;
  const path = getString(input, "filePath") ?? getString(input, "path");
  if (!path) return null;
  return <span className="truncate text-left">{path}</span>;
}

function MessagePartToolSummary() {
  const { meta } = useTool();
  const input = meta.part.state.input;

  const description =
    getString(input, "description") ??
    getString(input, "prompt") ??
    getString(input, "pattern") ??
    getString(input, "subject");

  if (!description) return <span className="flex-1" />;

  return <span className="flex-1 truncate text-left text-text-muted">{description}</span>;
}

function MessagePartToolDuration() {
  const { meta } = useTool();
  const status = meta.part.state.status;
  if (status !== "completed" && status !== "error") return null;
  const duration = meta.part.state.time.end - meta.part.state.time.start;
  return <span className="text-text-muted">{duration}ms</span>;
}

function MessagePartToolChevron() {
  const { state } = useTool();
  return (
    <ChevronRight size={12} className={cn("text-text-muted", state.expanded && "rotate-90")} />
  );
}

function MessagePartToolHeader({ children }: { children: ReactNode }) {
  const { actions } = useTool();

  return (
    <button
      type="button"
      onClick={actions.toggle}
      className="flex items-center gap-1.5 w-full px-3 py-1 text-xs cursor-pointer hover:bg-bg-hover"
    >
      {children}
    </button>
  );
}

function MessagePartToolDetails({ children }: { children: ReactNode }) {
  const { state } = useTool();
  if (!state.expanded) return null;
  return <div className="flex flex-col">{children}</div>;
}

const detailBlock = tv({
  base: "px-4 py-2 text-xs bg-bg-muted overflow-x-auto font-mono w-0 min-w-full",
});

function MessagePartToolInput({ input }: { input: Record<string, unknown> }) {
  return <pre className={detailBlock()}>{JSON.stringify(input, null, 2)}</pre>;
}

function MessagePartToolOutput({ output }: { output: string }) {
  return <pre className={cn(detailBlock(), "max-h-40 overflow-y-auto")}>{output}</pre>;
}

function MessagePartToolError({ error }: { error: string }) {
  return <div className={cn(detailBlock(), "text-red-500")}>{error}</div>;
}

type ToolRendererProps = {
  tool: string;
  callId: string;
  input?: Record<string, unknown>;
  output?: string | null;
  error?: string | null;
  status: string;
};

function MessagePartToolRenderer({
  tool,
  callId,
  input,
  output,
  error,
  status,
}: ToolRendererProps) {
  const Renderer = getToolRenderer(tool);
  return (
    <Renderer
      tool={tool}
      callId={callId}
      input={input}
      output={output}
      error={error}
      status={status as "pending" | "running" | "completed" | "error"}
    />
  );
}

function isImageMimeType(mime: string | undefined): boolean {
  return mime?.startsWith("image/") ?? false;
}

const MessagePartFile = memo(function MessagePartFile({ part }: { part: FilePart }) {
  const isImage = isImageMimeType(part.mime);

  if (isImage && part.url) {
    return (
      <div className="px-4 py-3" data-opencode-component="File">
        <img
          src={part.url}
          alt={part.filename ?? "Uploaded image"}
          className="max-w-xs max-h-48 rounded border border-border"
        />
        {part.filename && (
          <span className="block mt-1 text-xs text-text-muted">{part.filename}</span>
        )}
      </div>
    );
  }

  return (
    <div className={actionRow()} data-opencode-component="File">
      <span>{part.filename || part.url}</span>
      {part.source && "path" in part.source && (
        <span className="text-text-muted">{part.source.path}</span>
      )}
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
});

const metaRow = tv({
  base: "flex items-center gap-3 px-4 py-1.5 text-xs text-text-muted",
});

function MessagePartStepStart() {
  return null;
}

function MessagePartStepFinish() {
  return null;
}

const MessagePartSnapshot = memo(function MessagePartSnapshot({ part }: { part: SnapshotPart }) {
  return (
    <div className={metaRow()} data-opencode-component="Snapshot">
      <span>Snapshot</span>
      <span className="font-mono">{part.id.slice(0, 8)}</span>
    </div>
  );
});

function MessagePartPatch() {
  return (
    <div className={metaRow()} data-opencode-component="Patch">
      <span>Patch applied</span>
    </div>
  );
}

function MessagePartAgent() {
  return (
    <div className={actionRow()} data-opencode-component="Agent">
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>Agent task</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartSubtask({ part }: { part: SubtaskPart }) {
  return (
    <div className={actionRow()} data-opencode-component="Subtask">
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>{part.description}</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartRetry() {
  return (
    <div className={cn(actionRow(), "text-yellow-500")} data-opencode-component="Retry">
      <Loader2 size={14} className="animate-spin" />
      <span>Retrying...</span>
    </div>
  );
}

function MessagePartCompaction() {
  return (
    <div className={metaRow()} data-opencode-component="Compaction">
      <span>Context compacted</span>
    </div>
  );
}

function MessagePartRoot({
  part,
  isStreaming,
  children,
}: {
  part: Part;
  isStreaming?: boolean;
  children?: ReactNode;
}) {
  if (children) {
    return <>{children}</>;
  }

  if (isTextPart(part)) {
    return <MessagePartText part={part} isStreaming={isStreaming} />;
  }

  if (isReasoningPart(part)) {
    return (
      <MessagePartReasoning part={part}>
        <MessagePartReasoningHeader>
          <MessagePartReasoningChevron />
          <span className="text-text-muted shrink-0">Thinking</span>
          <MessagePartReasoningPreview />
        </MessagePartReasoningHeader>
        <MessagePartReasoningContent />
      </MessagePartReasoning>
    );
  }

  if (isToolPart(part)) {
    const status = part.state.status;
    const input = part.state.input;
    const output = status === "completed" ? part.state.output : null;
    const error = status === "error" ? part.state.error : null;
    const isQuestionTool = part.tool === "askuserquestion" || part.tool === "question";
    const shouldAutoExpand = isQuestionTool && status === "running";

    return (
      <MessagePartTool part={part} defaultExpanded={shouldAutoExpand}>
        <MessagePartToolHeader>
          <MessagePartToolStatus />
          <MessagePartToolName />
          <MessagePartToolPath />
          <MessagePartToolSummary />
          <MessagePartToolDuration />
          <MessagePartToolChevron />
        </MessagePartToolHeader>
        <MessagePartToolDetails>
          <MessagePartToolRenderer
            tool={part.tool}
            callId={part.callID}
            input={input}
            output={output}
            error={error}
            status={status}
          />
        </MessagePartToolDetails>
      </MessagePartTool>
    );
  }

  if (isFilePart(part)) {
    return <MessagePartFile part={part} />;
  }

  if (isStepStartPart(part)) {
    return <MessagePartStepStart part={part} />;
  }

  if (isStepFinishPart(part)) {
    return <MessagePartStepFinish part={part} />;
  }

  if (isSnapshotPart(part)) {
    return <MessagePartSnapshot part={part} />;
  }

  if (isPatchPart(part)) {
    return <MessagePartPatch part={part} />;
  }

  if (isAgentPart(part)) {
    return <MessagePartAgent part={part} />;
  }

  if (isSubtaskPart(part)) {
    return <MessagePartSubtask part={part} />;
  }

  if (isRetryPart(part)) {
    return <MessagePartRetry part={part} />;
  }

  if (isCompactionPart(part)) {
    return <MessagePartCompaction part={part} />;
  }

  return null;
}

const MessagePart = {
  Root: MessagePartRoot,
  Text: MessagePartText,
  Reasoning: MessagePartReasoning,
  ReasoningHeader: MessagePartReasoningHeader,
  ReasoningChevron: MessagePartReasoningChevron,
  ReasoningPreview: MessagePartReasoningPreview,
  ReasoningContent: MessagePartReasoningContent,
  Tool: MessagePartTool,
  ToolHeader: MessagePartToolHeader,
  ToolStatus: MessagePartToolStatus,
  ToolName: MessagePartToolName,
  ToolPath: MessagePartToolPath,
  ToolSummary: MessagePartToolSummary,
  ToolDuration: MessagePartToolDuration,
  ToolChevron: MessagePartToolChevron,
  ToolDetails: MessagePartToolDetails,
  ToolInput: MessagePartToolInput,
  ToolOutput: MessagePartToolOutput,
  ToolError: MessagePartToolError,
  File: MessagePartFile,
  StepStart: MessagePartStepStart,
  StepFinish: MessagePartStepFinish,
  Snapshot: MessagePartSnapshot,
  Patch: MessagePartPatch,
  Agent: MessagePartAgent,
  Subtask: MessagePartSubtask,
  Retry: MessagePartRetry,
  Compaction: MessagePartCompaction,
};

export { MessagePart };
