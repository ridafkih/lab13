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
import { ChevronDown } from "lucide-react";
import { useContainerLogs, type LogSource, type LogEntry } from "@/lib/use-container-logs";
import { cn } from "@/lib/cn";

const text = tv({
  base: "text-[10px]",
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
      setActiveTab(sources[0]!.id);
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
  const { state } = useContainerLogsContext();

  if (state.sources.length === 0) {
    return <ContainerLogsEmpty>No running containers</ContainerLogsEmpty>;
  }

  return <div className="flex flex-col">{children}</div>;
}

function ContainerLogsSelector() {
  const { state, actions } = useContainerLogsContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSource = state.sources.find((s) => s.id === state.activeTab);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  if (state.sources.length === 0) return null;

  if (state.sources.length === 1 && activeSource) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <ContainerLogsStatusIndicator status={activeSource.status} />
        <span className={cn("truncate", text({ color: "secondary" }))}>
          {activeSource.hostname}
        </span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative px-3 py-1.5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn("flex items-center gap-1.5 w-full", text({ color: "secondary" }))}
      >
        {activeSource && (
          <>
            <ContainerLogsStatusIndicator status={activeSource.status} />
            <span className="truncate flex-1 text-left">{activeSource.hostname}</span>
          </>
        )}
        <ChevronDown
          size={12}
          className={cn("shrink-0 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-10 mx-3 mt-1 bg-bg-muted border border-border rounded shadow-lg">
          {state.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => {
                actions.setActiveTab(source.id);
                setIsOpen(false);
              }}
              className={cn(
                "flex items-center gap-1.5 w-full px-2 py-1.5 text-left hover:bg-border transition-colors",
                text({ font: "sans" }),
                source.id === state.activeTab
                  ? text({ color: "default" })
                  : text({ color: "secondary" }),
              )}
            >
              <ContainerLogsStatusIndicator status={source.status} />
              <span className="truncate">{source.hostname}</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
      className={cn("flex flex-col h-48 overflow-y-auto overflow-x-auto", className)}
    >
      {containerLogs.map((entry, index) => (
        <ContainerLogsLine key={`${entry.timestamp}-${index}`} entry={entry} index={index} />
      ))}
    </div>
  );
}

function ContainerLogsLine({ entry, index }: { entry: LogEntry; index: number }) {
  const isEven = index % 2 === 0;

  return (
    <div className={cn("px-3 py-0.5", text({ font: "mono" }), isEven ? "bg-bg" : "bg-bg-muted")}>
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
  Selector: ContainerLogsSelector,
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
        <ContainerLogs.Selector />
        <ContainerLogs.Content />
      </ContainerLogs.Root>
    </ContainerLogs.Provider>
  );
}
