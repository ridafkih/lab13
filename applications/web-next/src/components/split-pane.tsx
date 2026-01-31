"use client";

import { createContext, use, useState, type ReactNode } from "react";

type SplitPaneContextValue = {
  selected: string | null;
  select: (id: string | null) => void;
};

const SplitPaneContext = createContext<SplitPaneContextValue | null>(null);

function useSplitPane() {
  const context = use(SplitPaneContext);
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
      <div className="flex flex-1 min-h-0">{children}</div>
    </SplitPaneContext>
  );
}

type SplitPanePrimaryProps = {
  children: ReactNode;
};

function SplitPanePrimary({ children }: SplitPanePrimaryProps) {
  return (
    <aside className="relative flex flex-col h-full w-1/2 max-w-lg border-r border-border bg-bg">
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
    <main className="flex-1 bg-bg">
      {typeof children === "function" ? children(selected) : children}
    </main>
  );
}

const SplitPaneRoot = SplitPane;

const SplitPaneNamespace = {
  Root: SplitPaneRoot,
  Primary: SplitPanePrimary,
  Secondary: SplitPaneSecondary,
};

export { SplitPaneNamespace as SplitPane, useSplitPane };
