"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  active: string;
  setActive: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = use(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within Tabs.Root");
  }
  return context;
}

type TabsRootProps =
  | { children: ReactNode; defaultTab: string; active?: never; onActiveChange?: never }
  | {
      children: ReactNode;
      active: string;
      onActiveChange: (tab: string) => void;
      defaultTab?: never;
    };

function TabsRoot(props: TabsRootProps) {
  const { children } = props;
  const isControlled = "active" in props && props.active !== undefined;

  const [internalActive, setInternalActive] = useState(
    isControlled ? props.active : props.defaultTab,
  );

  const active = isControlled ? props.active : internalActive;

  const setActive = (tab: string) => {
    if (isControlled) {
      props.onActiveChange?.(tab);
    } else {
      setInternalActive(tab);
    }
  };

  return <TabsContext value={{ active, setActive }}>{children}</TabsContext>;
}

function TabsList({ children, grow }: { children: ReactNode; grow?: boolean }) {
  return (
    <div className={cn("flex items-center gap-px px-0 border-b border-border", grow && "*:flex-1")}>
      {children}
    </div>
  );
}

const tab = tv({
  base: "px-2 py-1 text-xs cursor-pointer border-b max-w-full",
  variants: {
    active: {
      true: "text-text border-text",
      false: "text-text-muted border-transparent hover:text-text-secondary",
    },
  },
});

function TabsTab({ value, children }: { value: string; children: ReactNode }) {
  const { active, setActive } = useTabs();
  const isActive = active === value;

  return (
    <div className="px-1 min-w-0">
      <button type="button" onClick={() => setActive(value)} className={tab({ active: isActive })}>
        {children}
      </button>
    </div>
  );
}

function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  const { active } = useTabs();
  if (active !== value) return null;
  return <>{children}</>;
}

const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab: TabsTab,
  Content: TabsContent,
};

export { Tabs };
