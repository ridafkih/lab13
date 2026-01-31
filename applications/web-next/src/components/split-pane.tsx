"use client";

import { createContext, use, useState, type ReactNode } from "react";

type SplitPaneContextValue<T = string> = {
  selected: T | null;
  select: (id: T | null) => void;
};

const SplitPaneContext = createContext<SplitPaneContextValue | null>(null);

function useSplitPane<T = string>() {
  const context = use(SplitPaneContext) as SplitPaneContextValue<T> | null;
  if (!context) {
    throw new Error("SplitPane components must be used within SplitPane");
  }
  return context;
}

type SplitPaneProps = {
  children: ReactNode;
};

function SplitPane({ children }: SplitPaneProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <SplitPaneContext value={{ selected, select: setSelected }}>
      <div className="flex h-screen">{children}</div>
    </SplitPaneContext>
  );
}

type SplitPanePrimaryProps = {
  children: ReactNode;
};

function SplitPanePrimary({ children }: SplitPanePrimaryProps) {
  return (
    <aside className="flex flex-col h-full w-1/2 max-w-lg border-r border-border bg-bg">
      {children}
    </aside>
  );
}

type SplitPaneSecondaryProps = {
  children: ReactNode | ((selected: string | null) => ReactNode);
};

function SplitPaneSecondary({ children }: SplitPaneSecondaryProps) {
  const { selected } = useSplitPane();

  return (
    <main className="flex-1 bg-bg-muted">
      {typeof children === "function" ? children(selected) : children}
    </main>
  );
}

export { SplitPane, SplitPanePrimary, SplitPaneSecondary, useSplitPane };
