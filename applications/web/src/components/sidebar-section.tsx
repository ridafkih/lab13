import type { ReactNode } from "react";
import { Copy } from "@lab/ui/components/copy";

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="px-2 py-2 border-b border-border">
      <Copy size="xs" muted className="mb-1.5 block">
        {title}
      </Copy>
      {children}
    </div>
  );
}
