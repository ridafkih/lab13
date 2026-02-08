"use client";

import type { ReactNode } from "react";
import { ExternalLink, Box, GitBranch, FileText, CheckSquare, type LucideIcon } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/button";
import { cn } from "@/lib/cn";

const text = tv({
  base: "text-xs",
  variants: {
    color: {
      default: "text-text",
      secondary: "text-text-secondary",
      muted: "text-text-muted",
      accent: "text-accent",
      success: "text-green-500",
      warning: "text-yellow-500",
      error: "text-red-500",
    },
    font: {
      sans: "",
      mono: "font-mono",
    },
  },
  defaultVariants: {
    color: "default",
    font: "sans",
  },
});

const row = tv({
  base: "flex items-center gap-1.5 text-xs",
  variants: {
    interactive: {
      true: "cursor-pointer",
    },
  },
});

function SessionInfoPaneRoot({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-px bg-border overflow-y-auto overflow-x-hidden min-w-0 h-fit">
      {children}
    </div>
  );
}

function SessionInfoPaneSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 bg-bg px-3 py-2 min-w-0">{children}</div>;
}

function SessionInfoPaneScrollableContent({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 max-h-32 overflow-y-auto min-w-0">{children}</div>;
}

function SessionInfoPaneSectionHeader({ children }: { children: ReactNode }) {
  return <div className={text({ color: "secondary" })}>{children}</div>;
}

function SessionInfoPaneEmpty({ children }: { children: ReactNode }) {
  return <div className={text({ color: "muted" })}>{children}</div>;
}

function SessionInfoPaneItemList<T>({
  items,
  renderItem,
  emptyMessage,
  scrollable = false,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage: string;
  scrollable?: boolean;
}) {
  if (items.length === 0) {
    return <SessionInfoPaneEmpty>{emptyMessage}</SessionInfoPaneEmpty>;
  }

  const content = items.map(renderItem);

  if (scrollable) {
    return <SessionInfoPaneScrollableContent>{content}</SessionInfoPaneScrollableContent>;
  }

  return <>{content}</>;
}

function splitPath(path: string): { directory: string; filename: string } {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return { directory: "", filename: path };
  return {
    directory: path.slice(0, lastSlash + 1),
    filename: path.slice(lastSlash + 1),
  };
}

function SessionInfoPaneFileItem({
  path,
  status,
  onClick,
}: {
  path: string;
  status?: "added" | "modified" | "deleted";
  onClick?: () => void;
}) {
  const statusColor = {
    added: "success",
    modified: "warning",
    deleted: "error",
  } as const;

  const { directory, filename } = splitPath(path);

  return (
    <button
      type="button"
      onClick={onClick}
      className={row({ interactive: true, className: "w-full min-w-0 text-left" })}
    >
      <FileText size={12} className={cn(text({ color: "muted" }), "shrink-0")} />
      <span className="flex min-w-0 flex-1">
        <span className={cn(text({ color: "muted" }), "truncate")}>{directory}</span>
        <span className="shrink-0">{filename}</span>
      </span>
      {status && (
        <span className={cn(text({ color: statusColor[status] }), "shrink-0")}>
          {status[0]!.toUpperCase()}
        </span>
      )}
    </button>
  );
}

function SessionInfoPaneBranchItem({ name, current }: { name: string; current?: boolean }) {
  return (
    <div className={row({ interactive: true })}>
      <GitBranch size={12} className={text({ color: "muted" })} />
      <span className={cn("flex-1 truncate", current && "font-medium")}>{name}</span>
      {current && <span className={text({ color: "muted" })}>current</span>}
    </div>
  );
}

function SessionInfoPaneContainerItem({
  name,
  status,
}: {
  name: string;
  status: "running" | "stopped" | "starting" | "error" | "pending";
}) {
  const statusColor = {
    running: "success",
    stopped: "error",
    starting: "warning",
    error: "error",
    pending: "muted",
  } as const;

  return (
    <div className={row({ interactive: true })}>
      <Box size={12} className={text({ color: statusColor[status] })} />
      <span className={cn("flex-1 truncate", status === "pending" && "text-text-muted")}>
        {name}
      </span>
    </div>
  );
}

function SessionInfoPaneTaskItem({
  title,
  status,
}: {
  title: string;
  status: "pending" | "in_progress" | "completed";
}) {
  const statusIcon = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
  };

  return (
    <div className={row({ interactive: true })}>
      <CheckSquare size={12} className={text({ color: "muted" })} />
      <span className="flex-1 truncate">{title}</span>
      <span className={text({ color: "muted" })}>{statusIcon[status]}</span>
    </div>
  );
}

function parseUrl(href: string): { protocol: string; subdomain: string; domain: string } | null {
  try {
    const url = new URL(href);
    const hostnameParts = url.hostname.split(".");
    if (hostnameParts.length < 2) return null;
    const subdomain = hostnameParts.slice(0, -1).join(".");
    const tld = hostnameParts.at(-1) ?? "";
    return {
      protocol: `${url.protocol}//`,
      subdomain,
      domain: `${tld}${url.port ? `:${url.port}` : ""}`,
    };
  } catch {
    return null;
  }
}

function SessionInfoPaneLinkItem({ href }: { href: string }) {
  const parsed = parseUrl(href);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={row({
        interactive: true,
        className: cn(text({ color: "accent" }), "w-0 min-w-full"),
      })}
    >
      <ExternalLink size={12} className="shrink-0" />
      {parsed ? (
        <span className="flex min-w-0">
          <span className="shrink-0">{parsed.protocol}</span>
          <span className="truncate">{parsed.subdomain}</span>
          <span className="shrink-0">{parsed.domain}</span>
        </span>
      ) : (
        <span className="truncate">{href}</span>
      )}
    </a>
  );
}

function SessionInfoPaneStream({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col bg-bg pt-2">
      <div className={cn("px-3 pb-2", text({ color: "secondary" }))}>Live Browser</div>
      {children}
    </div>
  );
}

function SessionInfoPaneLogs({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col bg-bg pt-2">
      <div className={cn("px-3 pb-1", text({ color: "secondary" }))}>Logs</div>
      {children}
    </div>
  );
}

function SessionInfoPaneStreamPlaceholder() {
  return <div className="aspect-video bg-bg-muted" />;
}

function SessionInfoPaneLogItem({
  message,
  level = "info",
}: {
  message: string;
  level?: "info" | "warn" | "error";
}) {
  const levelColor = {
    info: "muted",
    warn: "warning",
    error: "error",
  } as const;

  return <div className={text({ color: levelColor[level], font: "mono" })}>{message}</div>;
}

function SessionInfoPaneActionButton({
  icon: Icon,
  children,
  onClick,
  variant = "primary",
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger";
}) {
  return (
    <Button variant={variant} onClick={onClick} className="w-full justify-center">
      <Icon size={12} />
      {children}
    </Button>
  );
}

const SessionInfoPane = {
  Root: SessionInfoPaneRoot,
  Section: SessionInfoPaneSection,
  ScrollableContent: SessionInfoPaneScrollableContent,
  SectionHeader: SessionInfoPaneSectionHeader,
  Empty: SessionInfoPaneEmpty,
  ItemList: SessionInfoPaneItemList,
  FileItem: SessionInfoPaneFileItem,
  BranchItem: SessionInfoPaneBranchItem,
  ContainerItem: SessionInfoPaneContainerItem,
  TaskItem: SessionInfoPaneTaskItem,
  LinkItem: SessionInfoPaneLinkItem,
  Stream: SessionInfoPaneStream,
  StreamPlaceholder: SessionInfoPaneStreamPlaceholder,
  Logs: SessionInfoPaneLogs,
  LogItem: SessionInfoPaneLogItem,
  ActionButton: SessionInfoPaneActionButton,
};

export { SessionInfoPane };
