"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@lab/ui/components/dropdown";
import { ChevronDown } from "lucide-react";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface LogSource {
  id: string;
  name: string;
  logs: LogEntry[];
}

const logLevelStyles: Record<LogLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

interface LogsSectionProps {
  sources: LogSource[];
}

interface LogsSectionHeaderProps {
  children: ReactNode;
}

interface LogsSectionSourceSelectorProps {
  sources: LogSource[];
  selectedId: string;
  onSelect: (id: string) => void;
}

interface LogsSectionContentProps {
  children: ReactNode;
}

interface LogsSectionEntryProps {
  entry: LogEntry;
}

export function LogsSection({ sources }: LogsSectionProps) {
  const [selectedSourceId, setSelectedSourceId] = useState(sources[0]?.id ?? "");
  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <LogsSectionRoot>
      <LogsSectionHeader>
        <Copy size="xs" muted className="px-2 py-1.5">
          Logs
        </Copy>
        <span className="flex-1" />
        <LogsSectionSourceSelector
          sources={sources}
          selectedId={selectedSourceId}
          onSelect={setSelectedSourceId}
        />
      </LogsSectionHeader>
      <LogsSectionContent>
        {!selectedSource || selectedSource.logs.length === 0 ? (
          <Copy size="xs" muted>
            No logs
          </Copy>
        ) : (
          selectedSource.logs.map((log) => <LogsSectionEntry key={log.id} entry={log} />)
        )}
      </LogsSectionContent>
    </LogsSectionRoot>
  );
}

export function LogsSectionRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0">{children}</div>;
}

export function LogsSectionHeader({ children }: LogsSectionHeaderProps) {
  return <div className="border-b border-border flex items-center">{children}</div>;
}

export function LogsSectionSourceSelector({
  sources,
  selectedId,
  onSelect,
}: LogsSectionSourceSelectorProps) {
  return (
    <Dropdown>
      <DropdownTrigger className="h-full px-2 py-1.5 text-xs flex items-center gap-1.5 hover:bg-muted/50">
        <span className="grid text-left">
          {sources.map((source) => (
            <span
              key={source.id}
              className={cn(
                "col-start-1 row-start-1",
                source.id === selectedId ? "visible" : "invisible",
              )}
            >
              {source.name}
            </span>
          ))}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownTrigger>
      <DropdownMenu className="right-0 left-auto">
        {sources.map((source) => (
          <DropdownItem
            key={source.id}
            onClick={() => onSelect(source.id)}
            className="text-xs py-1.5"
          >
            {source.name}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

export function LogsSectionContent({ children }: LogsSectionContentProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
      {children}
    </div>
  );
}

export function LogsSectionEntry({ entry }: LogsSectionEntryProps) {
  return (
    <div className={cn("whitespace-pre-wrap", logLevelStyles[entry.level])}>
      <span className="text-muted-foreground">{entry.timestamp}</span> {entry.message}
    </div>
  );
}
