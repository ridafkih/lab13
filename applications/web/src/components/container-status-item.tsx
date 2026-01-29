import type { ReactNode } from "react";
import { Copy } from "@lab/ui/components/copy";
import { Container } from "lucide-react";
import { StatusDot, type StatusDotVariant } from "./status-dot";

export type ContainerStatus = "running" | "stopped" | "starting" | "error";

const statusToVariant: Record<ContainerStatus, StatusDotVariant> = {
  running: "success",
  stopped: "muted",
  starting: "pulse",
  error: "error",
};

interface ContainerStatusItemProps {
  children: ReactNode;
}

interface ContainerStatusItemNameProps {
  children: ReactNode;
}

interface ContainerStatusItemDotProps {
  status: ContainerStatus;
}

export function ContainerStatusItem({ children }: ContainerStatusItemProps) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

export function ContainerStatusItemIcon() {
  return <Container className="size-3 text-muted-foreground" />;
}

export function ContainerStatusItemName({ children }: ContainerStatusItemNameProps) {
  return (
    <Copy size="xs" className="flex-1 truncate">
      {children}
    </Copy>
  );
}

export function ContainerStatusItemDot({ status }: ContainerStatusItemDotProps) {
  return <StatusDot variant={statusToVariant[status]} />;
}
