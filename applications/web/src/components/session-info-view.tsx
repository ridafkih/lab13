"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { SessionInfoPane } from "@/components/session-info-pane";
import { BrowserStreamView } from "@/components/browser-stream";
import { DefaultContainerLogs } from "@/components/container-logs";
import { useFileStatuses } from "@/lib/use-file-statuses";
import type { Project, Session } from "@lab/client";

type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

type SessionInfoViewProps = {
  session: Session;
  project: Project;
  containers: SessionContainer[];
  onDelete: () => void;
};

export function SessionInfoView({ session, project, containers, onDelete }: SessionInfoViewProps) {
  const router = useRouter();
  const { files: changedFiles } = useFileStatuses(session.id);
  const links = containers.flatMap((container) => container.urls.map(({ url }) => url));

  const projectContainers = project.containers ?? [];
  const hasSessionContainers = containers.length > 0;

  const handleFileClick = (path: string) => {
    const params = new URLSearchParams({ file: path, expand: "true" });
    router.push(`/editor/${session.id}/review?${params.toString()}`);
  };

  return (
    <SessionInfoPane.Root>
      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Changed Files</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ItemList
          items={changedFiles}
          emptyMessage="No changed files"
          scrollable
          renderItem={(file) => (
            <SessionInfoPane.FileItem
              key={file.path}
              path={file.path}
              status={file.status}
              onClick={() => handleFileClick(file.path)}
            />
          )}
        />
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Branches</SessionInfoPane.SectionHeader>
        <SessionInfoPane.Empty>No branches yet</SessionInfoPane.Empty>
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Containers</SessionInfoPane.SectionHeader>
        {hasSessionContainers ? (
          containers.map((container) => (
            <SessionInfoPane.ContainerItem
              key={container.id}
              name={container.name}
              status={container.status}
            />
          ))
        ) : projectContainers.length > 0 ? (
          projectContainers.map((container) => (
            <SessionInfoPane.ContainerItem
              key={container.id}
              name={container.image}
              status="pending"
            />
          ))
        ) : (
          <SessionInfoPane.Empty>No containers</SessionInfoPane.Empty>
        )}
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Tasks</SessionInfoPane.SectionHeader>
        <SessionInfoPane.Empty>No tasks yet</SessionInfoPane.Empty>
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Links</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ItemList
          items={links}
          emptyMessage="No links"
          renderItem={(url) => <SessionInfoPane.LinkItem key={url} href={url} />}
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
        <SessionInfoPane.ActionButton icon={Trash2} variant="danger" onClick={onDelete}>
          Delete
        </SessionInfoPane.ActionButton>
      </SessionInfoPane.Section>
    </SessionInfoPane.Root>
  );
}
