import type { ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { type FileChangeType, fileChangeTypeIcons, fileChangeTypeColors } from "@/lib/file-change";

export type { FileChangeType };

interface DismissibleFileHeaderProps {
  children: ReactNode;
}

interface DismissibleFileHeaderDismissProps {
  onDismiss: () => void;
}

interface DismissibleFileHeaderIconProps {
  changeType: FileChangeType;
}

interface DismissibleFileHeaderLabelProps {
  children: ReactNode;
}

export function DismissibleFileHeader({ children }: DismissibleFileHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border sticky top-0 bg-background z-10">
      {children}
    </div>
  );
}

export function DismissibleFileHeaderDismiss({ onDismiss }: DismissibleFileHeaderDismissProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring"
    >
      Dismiss
    </button>
  );
}

export function DismissibleFileHeaderIcon({ changeType }: DismissibleFileHeaderIconProps) {
  const Icon = fileChangeTypeIcons[changeType];
  return <Icon className={cn("size-3 shrink-0", fileChangeTypeColors[changeType])} />;
}

export function DismissibleFileHeaderLabel({ children }: DismissibleFileHeaderLabelProps) {
  return (
    <Copy size="xs" muted className="flex-1 truncate">
      {children}
    </Copy>
  );
}
