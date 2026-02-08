"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type OrchestrationStatus = "thinking" | "delegating" | "starting";

type OrchestrationItem = {
  id: string;
  status: OrchestrationStatus;
  projectName?: string;
};

type OrchestrationActions = {
  add: (item?: Partial<Omit<OrchestrationItem, "id">>) => string;
  update: (id: string, updates: Partial<Omit<OrchestrationItem, "id">>) => void;
  remove: (id: string) => void;
};

type OrchestrationContextValue = {
  items: OrchestrationItem[];
  actions: OrchestrationActions;
};

const OrchestrationContext = createContext<OrchestrationContextValue | null>(null);

function useOrchestrationItems() {
  const context = use(OrchestrationContext);
  if (!context) {
    throw new Error("useOrchestrationItems must be used within Orchestration.Provider");
  }
  return context.items;
}

type ProviderProps = {
  children: ReactNode;
};

function OrchestrationProvider({ children }: ProviderProps) {
  const [items, setItems] = useState<OrchestrationItem[]>([]);

  const add = (item?: Partial<Omit<OrchestrationItem, "id">>) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, status: "thinking", ...item }]);
    return id;
  };

  const update = (id: string, updates: Partial<Omit<OrchestrationItem, "id">>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const actions = { add, update, remove };
  const value = { items, actions };

  return <OrchestrationContext value={value}>{children}</OrchestrationContext>;
}

const statusMessages: Record<OrchestrationStatus, string> = {
  thinking: "Understanding your request...",
  delegating: "Identifying the right project...",
  starting: "Starting session...",
};

type IndicatorProps = {
  status: OrchestrationStatus;
  projectName?: string;
};

function OrchestrationIndicator({ status, projectName }: IndicatorProps) {
  const message =
    status === "starting" && projectName
      ? `Starting session in ${projectName}...`
      : statusMessages[status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-bg border border-border text-sm text-text-secondary pointer-events-auto">
      <Loader2 size={14} className="animate-spin" />
      <span>{message}</span>
    </div>
  );
}

function OrchestrationList() {
  const items = useOrchestrationItems();

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-2">
      {items.map((item) => (
        <OrchestrationIndicator key={item.id} status={item.status} projectName={item.projectName} />
      ))}
    </div>
  );
}

const Orchestration = {
  Provider: OrchestrationProvider,
  List: OrchestrationList,
  Indicator: OrchestrationIndicator,
};

export { Orchestration };
