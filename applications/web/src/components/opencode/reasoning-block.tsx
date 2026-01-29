"use client";

import { useState, useEffect } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { streamdownComponents } from "../streamdown-components";

interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ReasoningBlock({ content, isStreaming = false }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  useEffect(() => {
    setIsExpanded(isStreaming);
  }, [isStreaming]);

  return (
    <div className="border-b border-border bg-muted/30 min-w-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2 text-muted-foreground hover:bg-muted/50 min-w-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Brain className="size-3 shrink-0 text-violet-500" />
        <Copy as="span" size="xs" className="truncate">
          Thinking
        </Copy>
        <span className="flex-1" />
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
      </button>
      <div className={cn(isExpanded ? "max-h-125 overflow-y-auto" : "hidden")}>
        <div className="px-4 py-3 text-sm text-muted-foreground overflow-x-auto">
          <Streamdown
            plugins={{ code }}
            components={streamdownComponents}
            isAnimating={isStreaming}
          >
            {content}
          </Streamdown>
        </div>
      </div>
    </div>
  );
}
