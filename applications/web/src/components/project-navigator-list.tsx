"use client";

import { createContext, type HTMLProps, use, useState, type ReactNode } from "react";
import { ChevronRight, Box, Plus, Loader2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { IconButton } from "./icon-button";
import clsx from "clsx";

const ProjectNavigatorContext = createContext<{
  expanded: boolean;
  toggle: () => void;
  setExpanded: (expanded: boolean) => void;
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
      value={{
        expanded,
        toggle: () => setExpanded((isExpanded) => !isExpanded),
        setExpanded,
      }}
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
  const { expanded, toggle, setExpanded } = useProjectNavigator();

  return (
    <div onClick={toggle} className="group flex items-center gap-2 px-3 py-1.5 bg-bg-muted">
      <ChevronRight size={14} className={chevron({ expanded })} />
      <Box size={14} className="text-text-secondary shrink-0" />
      {children}
      <IconButton
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(true);
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

function ProjectNavigatorHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-px bg-border select-none">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-muted">
        <ChevronRight size={14} className="text-text-muted shrink-0" />
        <Loader2 size={14} className="animate-spin text-text-muted shrink-0" />
        <span className="text-text-muted">Loading...</span>
      </div>
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

type ItemProps = {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onMouseDown?: () => void;
};

function ProjectNavigatorItem({ children, selected, onClick, onMouseDown }: ItemProps) {
  const { expanded } = useProjectNavigator();

  if (!expanded) return null;

  return (
    <div onClick={onClick} onMouseDown={onMouseDown} className={listItem({ selected })}>
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

function ProjectNavigatorItemTitle({
  children,
  empty = false,
}: {
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <span className="text-text-muted italic truncate block overflow-hidden">Unnamed Session</span>
    );
  }

  return <span className="text-text truncate block overflow-hidden">{children}</span>;
}

function ProjectNavigatorItemDescription({
  children,
  className,
  ...props
}: { children?: ReactNode } & HTMLProps<HTMLSpanElement>) {
  return (
    <span {...props} className={clsx("text-text-muted text-right truncate", className)}>
      {children}
    </span>
  );
}

const ProjectNavigator = {
  List: ProjectNavigatorList,
  Header: ProjectNavigatorHeader,
  HeaderName: ProjectNavigatorHeaderName,
  HeaderCount: ProjectNavigatorHeaderCount,
  HeaderSkeleton: ProjectNavigatorHeaderSkeleton,
  Item: ProjectNavigatorItem,
  ItemTitle: ProjectNavigatorItemTitle,
  ItemDescription: ProjectNavigatorItemDescription,
  ItemSkeleton: ProjectNavigatorItemSkeleton,
  ItemSkeletonBlock: ProjectNavigatorItemSkeletonBlock,
};

export { ProjectNavigator };
