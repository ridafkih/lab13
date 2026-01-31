"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { ChevronRight, Box, Plus, Loader2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { IconButton } from "./icon-button";

const ProjectNavigatorContext = createContext<{
  expanded: boolean;
  toggle: () => void;
} | null>(null);

function useProjectNavigator() {
  const context = use(ProjectNavigatorContext);
  if (!context) {
    throw new Error("ProjectNavigator components must be used within ProjectNavigator.List");
  }
  return context;
}

type ListProps = {
  children: ReactNode;
  defaultExpanded?: boolean;
};

function ProjectNavigatorList({ children, defaultExpanded = true }: ListProps) {
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

type HeaderProps = {
  children: ReactNode;
  onAdd?: () => void;
};

function ProjectNavigatorHeader({ children, onAdd }: HeaderProps) {
  const { expanded, toggle } = useProjectNavigator();

  return (
    <div onClick={toggle} className="group flex items-center gap-2 px-3 py-1.5 bg-bg-muted">
      <ChevronRight size={14} className={chevron({ expanded })} />
      <Box size={14} className="text-text-secondary shrink-0" />
      {children}
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

function ProjectNavigatorHeaderName({ children }: { children: ReactNode }) {
  return <span className="truncate">{children}</span>;
}

function ProjectNavigatorHeaderCount({ children }: { children: ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
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

type ItemProps = {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
};

function ProjectNavigatorItem({ children, selected, onClick }: ItemProps) {
  const { expanded } = useProjectNavigator();

  if (!expanded) return null;

  return (
    <div onClick={onClick} className={listItem({ selected })}>
      {children}
    </div>
  );
}

function ProjectNavigatorItemSkeleton({ children }: { children?: ReactNode }) {
  const { expanded } = useProjectNavigator();

  if (!expanded) return null;

  return (
    <div className={listItem({ selected: false })}>
      <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />
      {children}
    </div>
  );
}

function ProjectNavigatorItemSkeletonBlock() {
  return <div className="h-3 w-full max-w-10 rounded bg-bg-hover animate-pulse" />;
}

function ProjectNavigatorItemTitle({ children }: { children: ReactNode }) {
  return <span className="text-text truncate">{children}</span>;
}

function ProjectNavigatorItemDescription({ children }: { children?: ReactNode }) {
  return <span className="text-text-muted truncate ml-auto max-w-1/2">{children}</span>;
}

function ProjectNavigatorItemEmptyTitle({ children }: { children: ReactNode }) {
  return <span className="text-text-muted italic truncate">{children}</span>;
}

const ProjectNavigator = {
  List: ProjectNavigatorList,
  Header: ProjectNavigatorHeader,
  HeaderName: ProjectNavigatorHeaderName,
  HeaderCount: ProjectNavigatorHeaderCount,
  Item: ProjectNavigatorItem,
  ItemTitle: ProjectNavigatorItemTitle,
  ItemEmptyTitle: ProjectNavigatorItemEmptyTitle,
  ItemDescription: ProjectNavigatorItemDescription,
  ItemSkeleton: ProjectNavigatorItemSkeleton,
  ItemSkeletonBlock: ProjectNavigatorItemSkeletonBlock,
};

export { ProjectNavigator, useProjectNavigator };
