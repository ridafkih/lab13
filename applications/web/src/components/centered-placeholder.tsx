import type { ReactNode } from "react";
import { Copy } from "@lab/ui/components/copy";

interface CenteredPlaceholderProps {
  children: ReactNode;
}

export function CenteredPlaceholder({ children }: CenteredPlaceholderProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Copy muted>{children}</Copy>
    </div>
  );
}
