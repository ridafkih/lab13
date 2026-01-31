import { Loader2, Circle, Check } from "lucide-react";
import { tv } from "tailwind-variants";

const statusIcon = tv({
  base: "shrink-0",
  variants: {
    status: {
      running: "animate-spin text-text-secondary",
      idle: "text-text-muted",
      complete: "text-accent",
    },
  },
});

export type SessionStatus = "running" | "idle" | "complete";

type StatusIconProps = {
  status: SessionStatus;
  size?: number;
};

export function StatusIcon({ status, size = 14 }: StatusIconProps) {
  const className = statusIcon({ status });

  switch (status) {
    case "running":
      return <Loader2 size={size} className={className} />;
    case "idle":
      return <Circle size={size} className={className} strokeDasharray="2 2" />;
    case "complete":
      return <Check size={size} className={className} />;
  }
}
