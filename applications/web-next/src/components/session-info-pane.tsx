"use client";

import type { ReactNode } from "react";
import { ExternalLink, Box, GitBranch, FileText, CheckSquare, type LucideIcon } from "lucide-react";
import { tv } from "tailwind-variants";
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
    <div className="flex flex-col gap-px bg-border h-full overflow-y-auto overflow-x-hidden min-w-0">
      {children}
      <div className="bg-bg grow" />
    </div>
  );
}

function SessionInfoPaneSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 bg-bg px-3 py-2 min-w-0">{children}</div>;
}

function SessionInfoPaneSectionHeader({ children }: { children: ReactNode }) {
  return <div className={text({ color: "secondary" })}>{children}</div>;
}

function SessionInfoPaneEmpty({ children }: { children: ReactNode }) {
  return <div className={text({ color: "muted" })}>{children}</div>;
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={row({ interactive: true, className: "w-full text-left" })}
    >
      <FileText size={12} className={text({ color: "muted" })} />
      <span className="flex-1 truncate">{path}</span>
      {status && (
        <span className={text({ color: statusColor[status] })}>{status[0].toUpperCase()}</span>
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
    <div className="flex flex-col gap-2 bg-bg pt-2">
      <div className={cn("px-3", text({ color: "secondary" }))}>Live Browser</div>
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

const actionButton = tv({
  base: "flex items-center justify-center gap-1.5 px-2 py-1 text-xs border w-full",
  variants: {
    variant: {
      default: "border-border bg-bg-muted text-text hover:bg-bg-hover",
      danger: "border-red-500/30 text-red-500 hover:bg-red-500/10",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function SessionInfoPaneActionButton({
  icon: Icon,
  children,
  onClick,
  variant = "default",
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button type="button" onClick={onClick} className={actionButton({ variant })}>
      <Icon size={12} />
      {children}
    </button>
  );
}

const SessionInfoPane = {
  Root: SessionInfoPaneRoot,
  Section: SessionInfoPaneSection,
  SectionHeader: SessionInfoPaneSectionHeader,
  Empty: SessionInfoPaneEmpty,
  FileItem: SessionInfoPaneFileItem,
  BranchItem: SessionInfoPaneBranchItem,
  ContainerItem: SessionInfoPaneContainerItem,
  TaskItem: SessionInfoPaneTaskItem,
  LinkItem: SessionInfoPaneLinkItem,
  Stream: SessionInfoPaneStream,
  StreamPlaceholder: SessionInfoPaneStreamPlaceholder,
  LogItem: SessionInfoPaneLogItem,
  ActionButton: SessionInfoPaneActionButton,
};

export { SessionInfoPane };
