"use client";

import type { Project, Session } from "@lab/client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrowserStreamView } from "@/components/browser-stream";
import { DefaultContainerLogs } from "@/components/container-logs";
import { SessionInfoPane } from "@/components/session-info-pane";
import { useMultiplayer } from "@/lib/multiplayer";
import { useFileStatuses } from "@/lib/use-file-statuses";

interface SessionContainer {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
}

interface SessionInfoViewProps {
  session: Session;
  project: Project;
  containers: SessionContainer[];
  onDelete: () => void;
}

export function SessionInfoView({
  session,
  project,
  containers,
  onDelete,
}: SessionInfoViewProps) {
  const router = useRouter();
  const { files: changedFiles } = useFileStatuses(session.id);
  const { useChannel } = useMultiplayer();
  const tasks = useChannel("sessionTasks", { uuid: session.id });
  const links = containers.flatMap((container) =>
    container.urls.map(({ url }) => url)
  );

  const projectContainers = project.containers ?? [];
  const hasSessionContainers = containers.length > 0;

  const handleFileClick = (path: string) => {
    const params = new URLSearchParams({ file: path, expand: "true" });
    router.push(`/editor/${session.id}/review?${params.toString()}`);
  };

  return (
    <SessionInfoPane.Root>
      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>
          Changed Files
        </SessionInfoPane.SectionHeader>
        <SessionInfoPane.ItemList
          emptyMessage="No changed files"
          items={changedFiles}
          renderItem={(file) => (
            <SessionInfoPane.FileItem
              key={file.path}
              onClick={() => handleFileClick(file.path)}
              path={file.path}
              status={file.status}
            />
          )}
          scrollable
        />
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Branches</SessionInfoPane.SectionHeader>
        <SessionInfoPane.Empty>No branches yet</SessionInfoPane.Empty>
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>
          Containers
        </SessionInfoPane.SectionHeader>
        {(() => {
          if (hasSessionContainers) {
            return containers.map((container) => (
              <SessionInfoPane.ContainerItem
                key={container.id}
                name={container.name}
                status={container.status}
              />
            ));
          }
          if (projectContainers.length > 0) {
            return projectContainers.map((container) => (
              <SessionInfoPane.ContainerItem
                key={container.id}
                name={container.image}
                status="pending"
              />
            ));
          }
          return <SessionInfoPane.Empty>No containers</SessionInfoPane.Empty>;
        })()}
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Tasks</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ItemList
          emptyMessage="No tasks yet"
          items={tasks}
          renderItem={(task) => (
            <SessionInfoPane.TaskItem
              key={task.id}
              status={task.status}
              title={task.content}
            />
          )}
          scrollable
        />
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Links</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ItemList
          emptyMessage="No links"
          items={links}
          renderItem={(url) => (
            <SessionInfoPane.LinkItem href={url} key={url} />
          )}
        />
      </SessionInfoPane.Section>

      <SessionInfoPane.Stream>
        <BrowserStreamView />
      </SessionInfoPane.Stream>

      <SessionInfoPane.Logs>
        <DefaultContainerLogs sessionId={session.id} />
      </SessionInfoPane.Logs>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Controls</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ActionButton
          icon={Trash2}
          onClick={onDelete}
          variant="danger"
        >
          Delete
        </SessionInfoPane.ActionButton>
      </SessionInfoPane.Section>
    </SessionInfoPane.Root>
  );
}
