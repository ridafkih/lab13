"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { ChevronRight, Box, Plus } from "lucide-react";
import { tv } from "tailwind-variants";
import { IconButton } from "./icon-button";
import { Avatar } from "./avatar";
import { StatusIcon, type SessionStatus } from "./status-icon";

const ProjectNavigatorContext = createContext<{
  expanded: boolean;
  toggle: () => void;
} | null>(null);

function useProjectNavigator() {
  const context = use(ProjectNavigatorContext);
  if (!context) {
    throw new Error("ProjectNavigator components must be used within ProjectNavigatorList");
  }
  return context;
}

type ProjectNavigatorListProps = {
  children: ReactNode;
  defaultExpanded?: boolean;
};

function ProjectNavigatorList({ children, defaultExpanded = true }: ProjectNavigatorListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <ProjectNavigatorContext
      value={{ expanded, toggle: () => setExpanded((isExpanded) => !isExpanded) }}
    >
      <div className="flex flex-col gap-px bg-border select-none">{children}</div>
    </ProjectNavigatorContext>
  );
}

const chevron = tv({
  base: "text-text-muted shrink-0 group-hover:text-text-secondary",
  variants: {
    expanded: {
      true: "rotate-90",
    },
  },
});

type ProjectNavigatorListHeaderProps = {
  name: string;
  count: number;
  onAdd?: () => void;
};

function ProjectNavigatorListHeader({ name, count, onAdd }: ProjectNavigatorListHeaderProps) {
  const { expanded, toggle } = useProjectNavigator();

  return (
    <div onClick={toggle} className="group flex items-center gap-2 px-3 py-1.5 bg-bg-muted">
      <ChevronRight size={14} className={chevron({ expanded })} />
      <Box size={14} className="text-text-secondary shrink-0" />
      <span className="truncate">{name}</span>
      <span className="text-text-muted">{count}</span>
      <IconButton
        onClick={(event) => {
          event.stopPropagation();
          onAdd?.();
        }}
        className="ml-auto"
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

const listItem = tv({
  base: "flex items-center gap-2 px-3 py-1.5 cursor-pointer bg-bg",
  variants: {
    selected: {
      true: "bg-bg-hover",
      false: "hover:bg-bg-hover",
    },
  },
  defaultVariants: {
    selected: false,
  },
});

type ProjectNavigatorListItemProps = {
  status: SessionStatus;
  hash: string;
  title: string;
  lastMessage: string;
  avatarUrl?: string;
  selected?: boolean;
  onClick?: () => void;
};

function ProjectNavigatorListItem({
  status,
  hash,
  title,
  lastMessage,
  avatarUrl,
  selected,
  onClick,
}: ProjectNavigatorListItemProps) {
  const { expanded } = useProjectNavigator();

  if (!expanded) return null;

  return (
    <div onClick={onClick} className={listItem({ selected })}>
      <StatusIcon status={status} />
      <span className="text-text-muted text-xs">{hash}</span>
      <span className="text-text truncate">{title}</span>
      <span className="text-text-muted truncate max-w-[50%] ml-auto">{lastMessage}</span>
      <Avatar src={avatarUrl} />
    </div>
  );
}

export { ProjectNavigatorList, ProjectNavigatorListHeader, ProjectNavigatorListItem };
