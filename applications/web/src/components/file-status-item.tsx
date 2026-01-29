import type { ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Checkbox } from "@lab/ui/components/checkbox";
import { type FileChangeType, fileChangeTypeIcons, fileChangeTypeColors } from "@/lib/file-change";

export type { FileChangeType };

interface FileStatusItemProps {
  children: ReactNode;
}

interface FileStatusItemCheckboxProps {
  checked: boolean;
  onChange: () => void;
}

interface FileStatusItemIconProps {
  changeType: FileChangeType;
}

interface FileStatusItemLabelProps {
  pathPrefix: string;
  parentFolder: string;
  filename: string;
  dismissed?: boolean;
  muted?: boolean;
}

export function FileStatusItem({ children }: FileStatusItemProps) {
  return <div className="flex items-center">{children}</div>;
}

export function FileStatusItemCheckbox({ checked, onChange }: FileStatusItemCheckboxProps) {
  return <Checkbox checked={checked} onChange={onChange} className="mr-1.5" />;
}

export function FileStatusItemIcon({ changeType }: FileStatusItemIconProps) {
  const Icon = fileChangeTypeIcons[changeType];
  return <Icon className={cn("size-3 shrink-0 mr-1", fileChangeTypeColors[changeType])} />;
}

export function FileStatusItemLabel({
  pathPrefix,
  parentFolder,
  filename,
  dismissed,
  muted,
}: FileStatusItemLabelProps) {
  const hasPrefix = pathPrefix.length > 0;
  const hasParent = parentFolder.length > 0;

  return (
    <Copy
      size="xs"
      className={cn(
        "flex-1 flex items-center min-w-0",
        dismissed && "line-through",
        muted && "text-muted-foreground",
      )}
    >
      {hasPrefix && (
        <>
          <span className="truncate whitespace-nowrap text-muted-foreground">{pathPrefix}</span>
          <span className="shrink-0 text-muted-foreground">/</span>
        </>
      )}
      {hasParent && (
        <>
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">{parentFolder}</span>
          <span className="shrink-0 text-muted-foreground">/</span>
        </>
      )}
      <span className={cn("shrink-0 whitespace-nowrap", dismissed && "text-muted-foreground")}>
        {filename}
      </span>
    </Copy>
  );
}
