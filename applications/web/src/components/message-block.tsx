import type { ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";

interface MessageBlockProps {
  children: ReactNode;
  variant?: "user" | "assistant";
}

export function MessageBlock({ children, variant = "user" }: MessageBlockProps) {
  const isAssistant = variant === "assistant";

  return (
    <div className={cn("border-b border-border px-4 py-3", isAssistant && "bg-muted")}>
      <Copy size="sm">{children}</Copy>
    </div>
  );
}
