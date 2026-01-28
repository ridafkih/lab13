"use client";

import { type ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Button } from "@lab/ui/components/button";
import { ChevronRight, Plus, Box } from "lucide-react";

type SidebarProps = {
  children: ReactNode;
};

export function Sidebar({ children }: SidebarProps) {
  return <aside className="flex h-full bg-border pr-px gap-px">{children}</aside>;
}

type SidebarPanelGroupProps = {
  children: ReactNode;
};

export function SidebarPanelGroup({ children }: SidebarPanelGroupProps) {
  return <div className="grid grid-cols-1 grid-rows-1 h-full">{children}</div>;
}

type SidebarPanelProps = {
  children: ReactNode;
  visible?: boolean;
};

export function SidebarPanel({ children, visible = true }: SidebarPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full min-w-48 bg-background col-start-1 row-start-1",
        !visible && "invisible",
      )}
    >
      {children}
    </div>
  );
}

type SidebarHeaderProps = {
  children: ReactNode;
  action?: ReactNode;
};

export function SidebarHeader({ children, action }: SidebarHeaderProps) {
  return (
    <div className="flex items-center gap-1 h-8 px-2 border-b border-border">
      <Copy as="span" size="xs" muted className="flex-1 truncate">
        {children}
      </Copy>
      {action}
    </div>
  );
}

type SidebarBodyProps = {
  children: ReactNode;
};

export function SidebarBody({ children }: SidebarBodyProps) {
  return <div className="flex-1 overflow-y-auto">{children}</div>;
}

type SidebarFooterProps = {
  children: ReactNode;
};

export function SidebarFooter({ children }: SidebarFooterProps) {
  return <div className="border-t border-border p-1.5">{children}</div>;
}

type SidebarProjectProps = {
  name: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function SidebarProject({ name, icon, active, onClick }: SidebarProjectProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-1.5 w-full px-2 py-1 text-muted-foreground",
        active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      {icon || <Box className="w-3 h-3" />}
      <Copy as="span" size="xs" className="flex-1 truncate text-left">
        {name}
      </Copy>
      <ChevronRight
        className={cn("w-3 h-3 opacity-0 group-hover:opacity-100", active && "opacity-100")}
      />
    </button>
  );
}

type SidebarSessionProps = {
  title: string;
  hasUnread?: boolean;
  active?: boolean;
  onClick?: () => void;
  timestamp?: string;
};

export function SidebarSession({
  title,
  hasUnread,
  active,
  onClick,
  timestamp,
}: SidebarSessionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1 text-left text-muted-foreground",
        active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <span className={cn("w-1 h-1 bg-info", !hasUnread && "invisible")} />
      <Copy as="span" size="xs" className="flex-1 truncate">
        {title}
      </Copy>
      {timestamp && (
        <Copy as="span" size="xs" muted>
          {timestamp}
        </Copy>
      )}
    </button>
  );
}

type SidebarActionProps = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
};

export function SidebarAction({ icon, label, onClick }: SidebarActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-foreground [&>svg]:w-3 [&>svg]:h-3"
    >
      {icon}
    </button>
  );
}

type SidebarNewSessionProps = {
  onClick?: () => void;
};

export function SidebarNewSession({ onClick }: SidebarNewSessionProps) {
  return (
    <div className="p-0.5">
      <Button onClick={onClick} icon={<Plus width={14} />} variant="secondary" className="w-full">
        New Chat
      </Button>
    </div>
  );
}
