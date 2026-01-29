"use client";

import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Checkbox } from "@lab/ui/components/checkbox";
import { GitBranch, ExternalLink } from "lucide-react";
import type { ReviewableFile } from "@/types/review";
import { SidebarSection } from "./sidebar-section";
import {
  FileStatusItem,
  FileStatusItemCheckbox,
  FileStatusItemIcon,
  FileStatusItemLabel,
} from "./file-status-item";
import {
  ContainerStatusItem,
  ContainerStatusItemIcon,
  ContainerStatusItemName,
  ContainerStatusItemDot,
  type ContainerStatus,
} from "./container-status-item";
import {
  IconLabelItem,
  IconLabelItemIcon,
  IconLabelItemText,
  IconLabelItemLink,
} from "./icon-label-item";
import { LogsSection, type LogSource } from "./logs-section";

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

type ContainerInfo = {
  id: string;
  name: string;
  status: ContainerStatus;
  urls: { port: number; url: string }[];
};

type SessionSidebarProps = {
  branches: Branch[];
  tasks: Task[];
  links: Link[];
  containers: ContainerInfo[];
  logSources: LogSource[];
  reviewFiles: ReviewableFile[];
  onDismissFile: (path: string) => void;
};

export function SessionSidebar({
  branches,
  tasks,
  links,
  containers,
  logSources,
  reviewFiles,
  onDismissFile,
}: SessionSidebarProps) {
  const allPortUrls = containers.flatMap((container) =>
    container.urls.map((urlInfo) => ({
      key: `${container.id}-${urlInfo.port}`,
      url: urlInfo.url,
      label: `${container.name}:${urlInfo.port}`,
    })),
  );

  return (
    <aside className="min-w-64 max-w-64 border-l border-border h-full flex flex-col">
      <div className="h-8 border-b border-border" />
      <div className="flex-1 overflow-y-auto">
        <SidebarSection title="Changed Files">
          {reviewFiles.length === 0 ? (
            <Copy size="xs" muted>
              No changed files
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {reviewFiles.map((file) => {
                const parts = file.path.split("/");
                const filename = parts.pop() ?? file.path;
                const parentFolder = parts.pop() ?? "";
                const pathPrefix = parts.join("/");
                const isDismissed = file.status === "dismissed";

                return (
                  <FileStatusItem key={file.path}>
                    <FileStatusItemCheckbox
                      checked={isDismissed}
                      onChange={() => onDismissFile(file.path)}
                    />
                    <FileStatusItemIcon changeType={file.changeType} />
                    <FileStatusItemLabel
                      pathPrefix={pathPrefix}
                      parentFolder={parentFolder}
                      filename={filename}
                      dismissed={isDismissed}
                    />
                  </FileStatusItem>
                );
              })}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="Branches">
          {branches.length === 0 ? (
            <Copy size="xs" muted>
              No branches yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {branches.map((branch) => (
                <IconLabelItem key={branch.id}>
                  <IconLabelItemIcon icon={GitBranch} />
                  <IconLabelItemText>{branch.name}</IconLabelItemText>
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
                </IconLabelItem>
              ))}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="Containers">
          <div className="flex flex-col gap-2">
            {containers.map((container) => (
              <ContainerStatusItem key={container.id}>
                <ContainerStatusItemIcon />
                <ContainerStatusItemName>{container.name}</ContainerStatusItemName>
                <ContainerStatusItemDot status={container.status} />
              </ContainerStatusItem>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Tasks">
          {tasks.length === 0 ? (
            <Copy size="xs" muted>
              No tasks yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <Checkbox key={task.id} checked={task.completed}>
                  <span className={cn(task.completed && "line-through text-muted-foreground")}>
                    {task.title}
                  </span>
                </Checkbox>
              ))}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="Links">
          {links.length === 0 && allPortUrls.length === 0 ? (
            <Copy size="xs" muted>
              No links yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {allPortUrls.map((portUrl) => (
                <IconLabelItemLink key={portUrl.key} icon={ExternalLink} href={portUrl.url}>
                  {portUrl.label}
                </IconLabelItemLink>
              ))}
              {links.map((link) => (
                <IconLabelItemLink key={link.id} icon={ExternalLink} href={link.url}>
                  {link.title}
                </IconLabelItemLink>
              ))}
            </div>
          )}
        </SidebarSection>

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

        <LogsSection sources={logSources} />
      </div>
    </aside>
  );
}
