import { Loader2, Circle, Check } from "lucide-react";
import { tv } from "tailwind-variants";
import type { SessionStatus } from "@lab/client";

const statusIcon = tv({
  base: "shrink-0",
  variants: {
    status: {
      creating: "animate-spin text-text-muted",
      loading: "animate-spin text-text-muted",
      running: "animate-spin text-text-secondary",
      idle: "text-text-muted",
      complete: "text-accent",
    },
  },
});

type StatusIconProps = {
  status: SessionStatus;
  size?: number;
};

export function StatusIcon({ status, size = 14 }: StatusIconProps) {
  const className = statusIcon({ status });

  switch (status) {
    case "creating":
    case "loading":
    case "running":
      return <Loader2 size={size} className={className} />;
    case "idle":
      return <Circle size={size} className={className} strokeDasharray="2 2" />;
    case "complete":
      return <Check size={size} className={className} />;
  }
}
