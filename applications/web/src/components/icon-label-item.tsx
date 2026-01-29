import type { ReactNode, ElementType, ComponentPropsWithoutRef } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";

interface IconLabelItemProps {
  children: ReactNode;
}

interface IconLabelItemIconProps {
  icon: ElementType;
  className?: string;
}

interface IconLabelItemTextProps {
  children: ReactNode;
  className?: string;
  strikethrough?: boolean;
}

interface IconLabelItemLinkProps extends ComponentPropsWithoutRef<"a"> {
  icon: ElementType;
  children: ReactNode;
}

export function IconLabelItem({ children }: IconLabelItemProps) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

export function IconLabelItemIcon({ icon: Icon, className }: IconLabelItemIconProps) {
  return <Icon className={cn("size-3 text-muted-foreground", className)} />;
}

export function IconLabelItemText({ children, className, strikethrough }: IconLabelItemTextProps) {
  return (
    <Copy
      size="xs"
      className={cn("truncate", strikethrough && "line-through text-muted-foreground", className)}
    >
      {children}
    </Copy>
  );
}

export function IconLabelItemLink({
  icon: Icon,
  children,
  className,
  ...props
}: IconLabelItemLinkProps) {
  return (
    <a
      className={cn("flex items-center gap-1.5 text-xs text-accent hover:underline", className)}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      <Icon className="size-3" />
      {children}
    </a>
  );
}
