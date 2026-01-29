import type { ReactNode } from "react";
import { Copy } from "@lab/ui/components/copy";

interface AvatarGroupProps {
  children: ReactNode;
}

interface AvatarGroupCountProps {
  count: number;
  singular: string;
  plural: string;
}

export function AvatarGroup({ children }: AvatarGroupProps) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export function AvatarGroupStack({ children }: AvatarGroupProps) {
  return <div className="flex -space-x-1">{children}</div>;
}

export function AvatarGroupCount({ count, singular, plural }: AvatarGroupCountProps) {
  return (
    <Copy size="xs" muted>
      {count} {count === 1 ? singular : plural}
    </Copy>
  );
}
