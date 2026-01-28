"use client";

import { useState } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Avatar } from "@lab/ui/components/avatar";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@lab/ui/components/dropdown";
import {
  GitBranch,
  Check,
  ExternalLink,
  Container,
  ChevronDown,
  File,
  FilePlus,
  FileX,
} from "lucide-react";
import type { ReviewableFile } from "@/types/review";

type PromptEngineer = {
  id: string;
  name: string;
  avatar?: string;
};

type Branch = {
  id: string;
  name: string;
  prNumber?: number;
  prUrl?: string;
};

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type Link = {
  id: string;
  title: string;
  url: string;
};

type ContainerStatus = "running" | "stopped" | "starting" | "error";

type ContainerInfo = {
  id: string;
  name: string;
  status: ContainerStatus;
};

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
};

type LogSource = {
  id: string;
  name: string;
  logs: LogEntry[];
};

type SessionSidebarProps = {
  promptEngineers: PromptEngineer[];
  branches: Branch[];
  tasks: Task[];
  links: Link[];
  containers: ContainerInfo[];
  logSources: LogSource[];
  reviewFiles: ReviewableFile[];
  onDismissFile: (path: string) => void;
};

const containerStatusStyles: Record<ContainerStatus, string> = {
  running: "bg-success",
  stopped: "bg-muted-foreground",
  starting: "bg-warning animate-pulse",
  error: "bg-destructive",
};

const logLevelStyles: Record<LogLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

const changeTypeIcons = {
  modified: File,
  created: FilePlus,
  deleted: FileX,
};

const changeTypeColors = {
  modified: "text-warning",
  created: "text-success",
  deleted: "text-destructive",
};

export function SessionSidebar({
  promptEngineers,
  branches,
  tasks,
  links,
  containers,
  logSources,
  reviewFiles,
  onDismissFile,
}: SessionSidebarProps) {
  return (
    <aside className="max-w-64 border-l border-border h-full flex flex-col">
      <div className="h-8 border-b border-border" />
      <div className="flex-1 overflow-y-auto">
        <Section title="Prompt Engineers">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {promptEngineers.slice(0, 3).map((engineer) => (
                <Avatar
                  key={engineer.id}
                  size="xs"
                  fallback={engineer.name.slice(0, 2).toUpperCase()}
                />
              ))}
            </div>
            <Copy size="xs" muted>
              {promptEngineers.length} {promptEngineers.length === 1 ? "engineer" : "engineers"}
            </Copy>
          </div>
        </Section>

        <Section title="Changed Files">
          {reviewFiles.length === 0 ? (
            <Copy size="xs" muted>
              No changed files
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {reviewFiles.map((file) => {
                const Icon = changeTypeIcons[file.changeType];
                const filename = file.path.split("/").pop() ?? file.path;
                const isDismissed = file.status === "dismissed";

                return (
                  <div key={file.path} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDismissFile(file.path)}
                      className={cn(
                        "w-3 h-3 flex-shrink-0 border flex items-center justify-center",
                        isDismissed
                          ? "border-foreground bg-foreground text-background"
                          : "border-muted-foreground",
                      )}
                    >
                      {isDismissed && <Check className="w-2 h-2" />}
                    </button>
                    <Icon
                      className={cn("w-3 h-3 flex-shrink-0", changeTypeColors[file.changeType])}
                    />
                    <Copy
                      size="xs"
                      className={cn(
                        "flex-1 truncate",
                        isDismissed && "line-through text-muted-foreground",
                      )}
                    >
                      {filename}
                    </Copy>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Branches">
          {branches.length === 0 ? (
            <Copy size="xs" muted>
              No branches yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {branches.map((branch) => (
                <div key={branch.id} className="flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3 text-muted-foreground" />
                  <Copy size="xs" className="truncate">
                    {branch.name}
                  </Copy>
                  {branch.prNumber && (
                    <a
                      href={branch.prUrl}
                      className="text-xs text-accent hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{branch.prNumber}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Containers">
          <div className="flex flex-col gap-1">
            {containers.map((container) => (
              <div key={container.id} className="flex items-center gap-1.5">
                <Container className="w-3 h-3 text-muted-foreground" />
                <Copy size="xs" className="flex-1 truncate">
                  {container.name}
                </Copy>
                <span className={cn("w-1.5 h-1.5", containerStatusStyles[container.status])} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tasks">
          {tasks.length === 0 ? (
            <Copy size="xs" muted>
              No tasks yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-3 h-3 flex-shrink-0 border flex items-center justify-center",
                      task.completed
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground",
                    )}
                  >
                    {task.completed && <Check className="w-2 h-2" />}
                  </span>
                  <Copy
                    size="xs"
                    className={cn(task.completed && "line-through text-muted-foreground")}
                  >
                    {task.title}
                  </Copy>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Links">
          {links.length === 0 ? (
            <Copy size="xs" muted>
              No links yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {link.title}
                </a>
              ))}
            </div>
          )}
        </Section>

        <div className="border-b border-border">
          <Copy size="xs" muted className="px-2 py-1.5 block">
            Stream
          </Copy>
          <div className="aspect-video bg-muted flex items-center justify-center">
            <Copy size="xs" muted>
              No stream
            </Copy>
          </div>
        </div>

        <LogsSection logSources={logSources} />
      </div>
    </aside>
  );
}

type LogsSectionProps = {
  logSources: LogSource[];
};

function LogsSection({ logSources }: LogsSectionProps) {
  const [selectedSourceId, setSelectedSourceId] = useState(logSources[0]?.id);
  const selectedSource = logSources.find((s) => s.id === selectedSourceId);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b border-border flex items-center">
        <Copy size="xs" muted className="px-2 py-1.5">
          Logs
        </Copy>
        <span className="flex-1" />
        <Dropdown>
          <DropdownTrigger className="h-full px-2 py-1.5 text-xs flex items-center gap-1.5 hover:bg-muted/50">
            <span className="grid text-left">
              {logSources.map((source) => (
                <span
                  key={source.id}
                  className={cn(
                    "col-start-1 row-start-1",
                    source.id === selectedSourceId ? "visible" : "invisible",
                  )}
                >
                  {source.name}
                </span>
              ))}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </DropdownTrigger>
          <DropdownMenu className="right-0 left-auto">
            {logSources.map((source) => (
              <DropdownItem
                key={source.id}
                onClick={() => setSelectedSourceId(source.id)}
                className="text-xs py-1.5"
              >
                {source.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
      <div className="flex-1 overflow-y-auto bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
        {!selectedSource || selectedSource.logs.length === 0 ? (
          <Copy size="xs" muted>
            No logs
          </Copy>
        ) : (
          selectedSource.logs.map((log) => (
            <div key={log.id} className={cn("whitespace-pre-wrap", logLevelStyles[log.level])}>
              <span className="text-muted-foreground">{log.timestamp}</span> {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <div className="px-2 py-2 border-b border-border">
      <Copy size="xs" muted className="mb-1.5 block">
        {title}
      </Copy>
      {children}
    </div>
  );
}
