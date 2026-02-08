import { Loader2, Check, AlertCircle, Trash2, CircleDashed } from "lucide-react";
import { tv } from "tailwind-variants";
import type { SessionStatus as BaseSessionStatus } from "@lab/client";

type UnifiedSessionStatus = "starting" | "running" | "generating" | "error" | "deleting";
type StatusIconStatus = BaseSessionStatus | UnifiedSessionStatus;

const statusIcon = tv({
  base: "shrink-0",
  variants: {
    status: {
      creating: "animate-spin text-text-muted",
      loading: "animate-spin text-text-muted",
      idle: "text-text-muted",
      complete: "text-accent",
      starting: "animate-spin text-text-muted",
      running: "text-text-muted",
      generating: "animate-spin text-accent",
      error: "text-red-500",
      deleting: "text-text-muted",
    },
  },
});

type StatusIconProps = {
  status: StatusIconStatus;
  size?: number;
};

export function StatusIcon({ status, size = 14 }: StatusIconProps) {
  const className = statusIcon({ status });

  switch (status) {
    case "creating":
    case "loading":
    case "starting":
    case "generating":
      return <Loader2 size={size} className={className} />;
    case "idle":
    case "running":
      return <CircleDashed size={size} className={className} />;
    case "complete":
      return <Check size={size} className={className} />;
    case "error":
      return <AlertCircle size={size} className={className} />;
    case "deleting":
      return <Trash2 size={size} className={className} />;
  }
}
