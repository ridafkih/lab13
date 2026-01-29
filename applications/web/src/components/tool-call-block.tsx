import type { ReactNode } from "react";
import { Copy } from "@lab/ui/components/copy";
import { Spinner } from "@lab/ui/components/spinner";
import { Check, ChevronDown } from "lucide-react";

interface ToolCallBlockProps {
  children: ReactNode;
}

interface ToolCallBlockStatusProps {
  completed: boolean;
}

interface ToolCallBlockDurationProps {
  children: ReactNode;
}

interface ToolCallBlockNameProps {
  children: ReactNode;
}

export function ToolCallBlock({ children }: ToolCallBlockProps) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full px-4 py-2 text-muted-foreground border-b border-border bg-muted/30 hover:bg-muted/50"
    >
      {children}
      <span className="flex-1" />
      <ChevronDown className="size-3" />
    </button>
  );
}

export function ToolCallBlockStatus({ completed }: ToolCallBlockStatusProps) {
  return completed ? <Check className="size-3" /> : <Spinner size="xxs" />;
}

export function ToolCallBlockDuration({ children }: ToolCallBlockDurationProps) {
  return (
    <Copy as="span" size="xs" muted>
      {children}
    </Copy>
  );
}

export function ToolCallBlockName({ children }: ToolCallBlockNameProps) {
  return (
    <Copy as="span" size="xs">
      {children}
    </Copy>
  );
}
