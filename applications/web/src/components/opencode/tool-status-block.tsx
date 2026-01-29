"use client";

import { useState } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Spinner } from "@lab/ui/components/spinner";
import { Clock, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ToolPart } from "@opencode-ai/sdk/client";

interface ToolStatusBlockProps {
  part: ToolPart;
}

function StatusIcon({ status }: { status: ToolPart["state"]["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="size-3 text-muted-foreground" />;
    case "running":
      return <Spinner size="xxs" />;
    case "completed":
      return <Check className="size-3 text-green-500" />;
    case "error":
      return <X className="size-3 text-red-500" />;
    default:
      return null;
  }
}

function formatDuration(start: number, end: number): string {
  const durationMs = end - start;
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function ToolStatusBlock({ part }: ToolStatusBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { state, tool } = part;

  const title =
    state.status === "running" || state.status === "completed" ? (state.title ?? tool) : tool;

  const duration =
    (state.status === "completed" || state.status === "error") && state.time
      ? formatDuration(state.time.start, state.time.end)
      : null;

  const hasDetails =
    state.status === "completed" || state.status === "error" || state.status === "running";

  return (
    <div className="border-b border-border bg-muted/30 min-w-0 overflow-hidden">
      <button
        type="button"
        className={cn(
          "flex items-center gap-2 w-full px-4 py-2 text-muted-foreground min-w-0",
          hasDetails && "hover:bg-muted/50",
        )}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        disabled={!hasDetails}
      >
        <span className="shrink-0">
          <StatusIcon status={state.status} />
        </span>
        <span className="truncate text-xs font-sans text-foreground">{title}</span>
        {duration && (
          <span className="shrink-0 text-xs font-sans text-muted-foreground">{duration}</span>
        )}
        <span className="flex-1 min-w-0" />
        {hasDetails && (
          <span className="shrink-0">
            {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </span>
        )}
      </button>

      {hasDetails && (
        <div className={cn(isExpanded ? "max-h-125 overflow-y-auto" : "hidden")}>
          <div className="px-4 py-3 space-y-3 min-w-0">
            {state.input && Object.keys(state.input).length > 0 && (
              <div className="min-w-0">
                <p className="text-xs font-sans text-muted-foreground mb-1">Input</p>
                <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto w-0 min-w-full">
                  {JSON.stringify(state.input, null, 2)}
                </pre>
              </div>
            )}

            {state.status === "completed" && state.output && (
              <div className="min-w-0">
                <p className="text-xs font-sans text-muted-foreground mb-1">Output</p>
                <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto w-0 min-w-full max-h-40 overflow-y-auto">
                  {state.output}
                </pre>
              </div>
            )}

            {state.status === "error" && state.error && (
              <div className="min-w-0">
                <p className="text-xs font-sans text-red-500 mb-1">Error</p>
                <pre className="text-xs font-mono bg-red-500/10 text-red-500 p-2 rounded overflow-x-auto w-0 min-w-full">
                  {state.error}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
