"use client";

import {
  Check,
  ChevronRight,
  File,
  FileEdit,
  FilePlus,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { createContext, memo, type ReactNode, use, useState } from "react";
import { tv } from "tailwind-variants";
import { getToolRenderer } from "@/components/tool-renderers/registry";
import type { ToolStatus } from "@/components/tool-renderers/types";
import type {
  ContentPart,
  FileRefContentPart,
  ImageContentPart,
  ReasoningContentPart,
  TextContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "@/lib/acp-types";
import {
  isFileRefPart,
  isImagePart,
  isReasoningPart,
  isTextPart,
  isToolCallPart,
  isToolResultPart,
} from "@/lib/acp-types";
import { cn } from "@/lib/cn";
import { Markdown } from "./markdown";

function getToolStatus(
  result: { error?: string } | null | undefined
): "error" | "completed" {
  return result?.error ? "error" : "completed";
}

const contentBlock = tv({
  base: "px-4 py-3 text-sm",
});

function MessagePartText({
  part,
  isStreaming,
}: {
  part: TextContentPart;
  isStreaming?: boolean;
}) {
  if (part.text.trim().length === 0) {
    return null;
  }

  return (
    <div className={contentBlock()} data-component="Text">
      <Markdown isStreaming={isStreaming}>{part.text}</Markdown>
    </div>
  );
}

interface ReasoningContextValue {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ReasoningContentPart };
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error(
      "Reasoning components must be used within MessagePart.Reasoning"
    );
  }
  return context;
}

function MessagePartReasoning({
  part,
  children,
}: {
  part: ReasoningContentPart;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (part.text.trim().length === 0) {
    return null;
  }

  return (
    <ReasoningContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part },
      }}
    >
      <div data-component="Reasoning">{children}</div>
    </ReasoningContext>
  );
}

function MessagePartReasoningHeader({ children }: { children: ReactNode }) {
  const { actions } = useReasoning();

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1 text-xs hover:bg-bg-hover"
      onClick={actions.toggle}
      type="button"
    >
      {children}
    </button>
  );
}

function MessagePartReasoningChevron() {
  const { state } = useReasoning();
  return (
    <ChevronRight
      className={cn("shrink-0 text-text-muted", state.expanded && "rotate-90")}
      size={12}
    />
  );
}

function MessagePartReasoningPreview() {
  const { state, meta } = useReasoning();
  if (state.expanded) {
    return null;
  }
  return (
    <span className="flex-1 overflow-hidden truncate whitespace-nowrap text-right text-text-muted italic">
      {meta.part.text}
    </span>
  );
}

function MessagePartReasoningContent() {
  const { state, meta } = useReasoning();
  if (!state.expanded) {
    return null;
  }
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
      running: "animate-spin text-text-muted",
      completed: "text-green-500",
      error: "text-red-500",
    },
  },
});

interface ToolContextValue {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ToolCallContentPart; result?: ToolResultContentPart };
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useTool() {
  const context = use(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within MessagePart.Tool");
  }
  return context;
}

interface MessagePartToolProps {
  part: ToolCallContentPart;
  result?: ToolResultContentPart;
  children: ReactNode;
  defaultExpanded?: boolean;
}

function MessagePartTool({
  part,
  result,
  children,
  defaultExpanded = false,
}: MessagePartToolProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <ToolContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part, result },
      }}
    >
      <div data-component="Tool">{children}</div>
    </ToolContext>
  );
}

const fileToolIcons = {
  edit: { icon: FileEdit, color: "text-yellow-500" },
  write: { icon: FilePlus, color: "text-green-500" },
  read: { icon: File, color: "text-text-muted" },
};

function hasOwnKey<T extends object>(
  source: T,
  key: PropertyKey
): key is keyof T {
  return Object.hasOwn(source, key);
}

function resolveFileToolConfig(toolName: string) {
  if (!hasOwnKey(fileToolIcons, toolName)) {
    return undefined;
  }
  return fileToolIcons[toolName];
}

function MessagePartToolStatus() {
  const { meta } = useTool();
  const status = meta.part.status;
  const toolName = meta.part.name;

  const fileToolConfig = resolveFileToolConfig(toolName);

  if (status === "in_progress") {
    if (fileToolConfig) {
      const Icon = fileToolConfig.icon;
      return (
        <Icon
          className={cn("shrink-0 animate-pulse", fileToolConfig.color)}
          size={12}
        />
      );
    }
    return (
      <Loader2
        className={cn("shrink-0", toolStatus({ status: "running" }))}
        size={12}
      />
    );
  }
  if (status === "completed") {
    if (fileToolConfig) {
      const Icon = fileToolConfig.icon;
      return (
        <Icon className={cn("shrink-0", fileToolConfig.color)} size={12} />
      );
    }
    return (
      <Check
        className={cn("shrink-0", toolStatus({ status: "completed" }))}
        size={12}
      />
    );
  }
  if (status === "error") {
    return (
      <span className={cn("shrink-0", toolStatus({ status: "error" }))}>✕</span>
    );
  }
  return null;
}

function MessagePartToolName() {
  const { meta } = useTool();
  return <span className="text-text-secondary">{meta.part.name}</span>;
}

function getString(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  const value = Object.fromEntries(Object.entries(obj))[key];
  return typeof value === "string" ? value : null;
}

function MessagePartToolPath() {
  const { meta } = useTool();
  const input = meta.part.input;
  const path = getString(input, "filePath") ?? getString(input, "path");
  if (!path) {
    return null;
  }
  return <span className="truncate text-left">{path}</span>;
}

function MessagePartToolSummary() {
  const { meta } = useTool();
  const input = meta.part.input;

  const description =
    getString(input, "description") ??
    getString(input, "prompt") ??
    getString(input, "pattern") ??
    getString(input, "subject");

  if (!description) {
    return <span className="flex-1" />;
  }

  return (
    <span className="flex-1 truncate text-left text-text-muted">
      {description}
    </span>
  );
}

function MessagePartToolDuration() {
  return null;
}

function MessagePartToolChevron() {
  const { state } = useTool();
  return (
    <ChevronRight
      className={cn("text-text-muted", state.expanded && "rotate-90")}
      size={12}
    />
  );
}

function MessagePartToolHeader({ children }: { children: ReactNode }) {
  const { actions } = useTool();

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1 text-xs hover:bg-bg-hover"
      onClick={actions.toggle}
      type="button"
    >
      {children}
    </button>
  );
}

function MessagePartToolDetails({ children }: { children: ReactNode }) {
  const { state } = useTool();
  if (!state.expanded) {
    return null;
  }
  return <div className="flex flex-col">{children}</div>;
}

const detailBlock = tv({
  base: "w-0 min-w-full overflow-x-auto bg-bg-muted px-4 py-2 font-mono text-xs",
});

function MessagePartToolInput({ input }: { input: Record<string, unknown> }) {
  return <pre className={detailBlock()}>{JSON.stringify(input, null, 2)}</pre>;
}

function MessagePartToolOutput({ output }: { output: string }) {
  return (
    <pre className={cn(detailBlock(), "max-h-40 overflow-y-auto")}>
      {output}
    </pre>
  );
}

function MessagePartToolError({ error }: { error: string }) {
  return <div className={cn(detailBlock(), "text-red-500")}>{error}</div>;
}

interface ToolRendererProps {
  tool: string;
  callId: string;
  input?: Record<string, unknown>;
  output?: string | null;
  error?: string | null;
  status: ToolStatus;
}

function toToolStatus(status: string): ToolStatus {
  if (
    status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "error"
  ) {
    return status;
  }
  return "pending";
}

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
      callId={callId}
      error={error}
      input={input}
      output={output}
      status={toToolStatus(status)}
      tool={tool}
    />
  );
}

const MessagePartFileRef = memo(function MessagePartFileRef({
  part,
}: {
  part: FileRefContentPart;
}) {
  const action = part.action ?? "read";
  const config = resolveFileToolConfig(action) ?? {
    icon: File,
    color: "text-text-muted",
  };
  const Icon = config.icon;

  return (
    <div className={actionRow()} data-component="FileRef">
      <Icon className={cn("shrink-0", config.color)} size={14} />
      <span className="truncate">{part.path}</span>
    </div>
  );
});

const MessagePartImage = memo(function MessagePartImage({
  part,
}: {
  part: ImageContentPart;
}) {
  return (
    <div className="px-4 py-3" data-component="Image">
      <Image
        alt={part.filename ?? "Image"}
        className="max-h-48 max-w-xs rounded border border-border"
        height={192}
        src={part.url}
        unoptimized
        width={320}
      />
      {part.filename && (
        <span className="mt-1 block text-text-muted text-xs">
          {part.filename}
        </span>
      )}
    </div>
  );
});

function findToolResult(
  parts: ContentPart[],
  toolCallId: string
): ToolResultContentPart | undefined {
  return parts.find(
    (p): p is ToolResultContentPart =>
      p.type === "tool_result" && p.tool_call_id === toolCallId
  );
}

function MessagePartRoot({
  part,
  allParts,
  isStreaming,
  children,
}: {
  part: ContentPart;
  allParts?: ContentPart[];
  isStreaming?: boolean;
  children?: ReactNode;
}) {
  if (children) {
    return <>{children}</>;
  }

  if (isTextPart(part)) {
    return <MessagePartText isStreaming={isStreaming} part={part} />;
  }

  if (isReasoningPart(part)) {
    return (
      <MessagePartReasoning part={part}>
        <MessagePartReasoningHeader>
          <MessagePartReasoningChevron />
          <span className="shrink-0 text-text-muted">Thinking</span>
          <MessagePartReasoningPreview />
        </MessagePartReasoningHeader>
        <MessagePartReasoningContent />
      </MessagePartReasoning>
    );
  }

  if (isToolCallPart(part)) {
    const result = allParts ? findToolResult(allParts, part.id) : undefined;
    const isQuestionTool =
      part.name === "askuserquestion" || part.name === "question";
    const shouldAutoExpand = isQuestionTool && part.status === "in_progress";

    return (
      <MessagePartTool
        defaultExpanded={shouldAutoExpand}
        part={part}
        result={result}
      >
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
            callId={part.id}
            error={result?.error ?? null}
            input={part.input}
            output={result?.output ?? null}
            status={
              part.status === "in_progress" ? "running" : getToolStatus(result)
            }
            tool={part.name}
          />
        </MessagePartToolDetails>
      </MessagePartTool>
    );
  }

  if (isToolResultPart(part)) {
    return null;
  }

  if (isFileRefPart(part)) {
    return <MessagePartFileRef part={part} />;
  }

  if (isImagePart(part)) {
    return <MessagePartImage part={part} />;
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
  FileRef: MessagePartFileRef,
  Image: MessagePartImage,
};

export { MessagePart };
