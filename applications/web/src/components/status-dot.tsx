import { cn } from "@lab/ui/utils/cn";

export type StatusDotVariant = "success" | "warning" | "error" | "muted" | "pulse";

const variantStyles: Record<StatusDotVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  muted: "bg-muted-foreground",
  pulse: "bg-warning animate-pulse",
};

interface StatusDotProps {
  variant: StatusDotVariant;
  className?: string;
}

export function StatusDot({ variant, className }: StatusDotProps) {
  return <span className={cn("size-1.5", variantStyles[variant], className)} />;
}
