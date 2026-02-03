"use client";

import {
  createContext,
  use,
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { tv } from "tailwind-variants";
import { Tabs } from "@/components/tabs";
import { useContainerLogs, type LogSource, type LogEntry } from "@/lib/use-container-logs";
import { cn } from "@/lib/cn";

const text = tv({
  base: "text-xs",
  variants: {
    color: {
      default: "text-text",
      secondary: "text-text-secondary",
      muted: "text-text-muted",
      error: "text-red-400",
      success: "text-green-500",
      warning: "text-yellow-500",
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

interface ContainerLogsState {
  sources: LogSource[];
  logs: Record<string, LogEntry[]>;
  activeTab: string | null;
}

interface ContainerLogsActions {
  setActiveTab: (containerId: string | null) => void;
  clearLogs: (containerId?: string) => void;
}

interface ContainerLogsMeta {
  contentRef: RefObject<HTMLDivElement | null>;
}

interface ContainerLogsContextValue {
  state: ContainerLogsState;
  actions: ContainerLogsActions;
  meta: ContainerLogsMeta;
}

const ContainerLogsContext = createContext<ContainerLogsContextValue | null>(null);

function useContainerLogsContext() {
  const context = use(ContainerLogsContext);
  if (!context) {
    throw new Error("ContainerLogs components must be used within ContainerLogs.Provider");
  }
  return context;
}

function ContainerLogsProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const { sources, logs, clearLogs } = useContainerLogs(sessionId);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sources.length > 0 && (!activeTab || !sources.find((s) => s.id === activeTab))) {
      setActiveTab(sources[0].id);
    } else if (sources.length === 0) {
      setActiveTab(null);
    }
  }, [sources, activeTab]);

  return (
    <ContainerLogsContext
      value={{
        state: { sources, logs, activeTab },
        actions: { setActiveTab, clearLogs },
        meta: { contentRef },
      }}
    >
      {children}
    </ContainerLogsContext>
  );
}

function ContainerLogsRoot({ children }: { children: ReactNode }) {
  const { state, actions } = useContainerLogsContext();

  if (state.sources.length === 0) {
    return <ContainerLogsEmpty>No running containers</ContainerLogsEmpty>;
  }

  return (
    <Tabs.Root
      active={state.activeTab ?? state.sources[0]?.id ?? ""}
      onActiveChange={(tab) => actions.setActiveTab(tab)}
    >
      <div className="flex flex-col gap-1 overflow-x-hidden">{children}</div>
    </Tabs.Root>
  );
}

function ContainerLogsTabs() {
  const { state } = useContainerLogsContext();

  if (state.sources.length === 0) return null;

  return (
    <Tabs.List grow>
      {state.sources.map((source) => (
        <Tabs.Tab key={source.id} value={source.id}>
          <div className="flex items-center gap-1.5 w-full overflow-x-hidden">
            <ContainerLogsStatusIndicator status={source.status} />
            <span className="truncate">{source.hostname}</span>
          </div>
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );
}

function ContainerLogsStatusIndicator({ status }: { status: LogSource["status"] }) {
  const statusColor = {
    streaming: "bg-green-500",
    stopped: "bg-text-muted",
    error: "bg-red-500",
  };

  return <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor[status])} />;
}

function ContainerLogsContent({ className }: { className?: string }) {
  const { state, meta } = useContainerLogsContext();
  const [autoScroll, setAutoScroll] = useState(true);
  const lastLogCount = useRef(0);

  const containerLogs = state.activeTab ? (state.logs[state.activeTab] ?? []) : [];

  const handleScroll = () => {
    const container = meta.contentRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (autoScroll && containerLogs.length > lastLogCount.current) {
      const container = meta.contentRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
    lastLogCount.current = containerLogs.length;
  }, [containerLogs.length, autoScroll, meta.contentRef]);

  if (!state.activeTab) {
    return <ContainerLogsEmpty>No running containers</ContainerLogsEmpty>;
  }

  if (containerLogs.length === 0) {
    return <ContainerLogsEmpty>Waiting for logs...</ContainerLogsEmpty>;
  }

  return (
    <div
      ref={meta.contentRef}
      onScroll={handleScroll}
      className={cn(
        "flex flex-col h-48 overflow-y-auto overflow-x-auto bg-bg-muted rounded px-2 py-1",
        className,
      )}
    >
      {containerLogs.map((entry, index) => (
        <ContainerLogsLine key={`${entry.timestamp}-${index}`} entry={entry} />
      ))}
    </div>
  );
}

function ContainerLogsLine({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.timestamp);
  const timeString = time.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={cn("flex gap-2 py-px", text({ font: "mono" }))}>
      <span className={cn(text({ color: "muted" }), "shrink-0")}>{timeString}</span>
      <span
        className={cn(
          "whitespace-nowrap",
          entry.stream === "stderr" ? text({ color: "error" }) : text({ color: "default" }),
        )}
      >
        {entry.text}
      </span>
    </div>
  );
}

function ContainerLogsEmpty({ children }: { children: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-center h-32", text({ color: "muted" }))}>
      {children}
    </div>
  );
}

export const ContainerLogs = {
  Provider: ContainerLogsProvider,
  Root: ContainerLogsRoot,
  Tabs: ContainerLogsTabs,
  StatusIndicator: ContainerLogsStatusIndicator,
  Content: ContainerLogsContent,
  Line: ContainerLogsLine,
  Empty: ContainerLogsEmpty,
  Context: ContainerLogsContext,
};

export function DefaultContainerLogs({ sessionId }: { sessionId: string }) {
  return (
    <ContainerLogs.Provider sessionId={sessionId}>
      <ContainerLogs.Root>
        <ContainerLogs.Tabs />
        <ContainerLogs.Content />
      </ContainerLogs.Root>
    </ContainerLogs.Provider>
  );
}
