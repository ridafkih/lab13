"use client";

import { useRouter } from "next/navigation";
import { ProjectNavigator } from "@/components/project-navigator-list";
import { SessionItem } from "@/components/session-item";
import { useProjects, useSessions, useCreateSession } from "@/lib/hooks";
import { useSessionsSync } from "@/lib/use-sessions-sync";
import type { Project } from "@lab/client";

function SidebarSessionItem({ isSelected }: { isSelected: boolean }) {
  const { prefetch } = SessionItem.useContext();

  return (
    <SessionItem.Link className="contents">
      <ProjectNavigator.Item selected={isSelected} onMouseDown={prefetch}>
        <div className="max-w-1/2 flex items-center gap-2">
          <SessionItem.Status />
          <SessionItem.Hash />
          <SessionItem.Title />
        </div>
        <div className="flex grow overflow-hidden justify-end">
          <SessionItem.LastMessage />
        </div>
      </ProjectNavigator.Item>
    </SessionItem.Link>
  );
}

type ProjectSessionsListProps = {
  project: Project;
  selectedSessionId: string | null;
};

function ProjectSessionsList({ project, selectedSessionId }: ProjectSessionsListProps) {
  const router = useRouter();
  const { data: sessions } = useSessions(project.id);
  const createSession = useCreateSession();

  const sessionCount = sessions?.length ?? 0;

  const handleAddSession = async () => {
    const session = await createSession(project.id);
    if (session) router.push(`/editor/${session.id}/chat`);
  };

  return (
    <ProjectNavigator.List>
      <ProjectNavigator.Header onAdd={handleAddSession}>
        <ProjectNavigator.HeaderName>{project.name}</ProjectNavigator.HeaderName>
        <ProjectNavigator.HeaderCount>{sessionCount}</ProjectNavigator.HeaderCount>
      </ProjectNavigator.Header>
      {sessions?.map((session) => (
        <SessionItem.Provider key={session.id} session={session}>
          <SidebarSessionItem isSelected={selectedSessionId === session.id} />
        </SessionItem.Provider>
      ))}
    </ProjectNavigator.List>
  );
}

type ProjectNavigatorViewProps = {
  selectedSessionId?: string | null;
};

export function ProjectNavigatorView({ selectedSessionId = null }: ProjectNavigatorViewProps) {
  const { data: projects, isLoading, error } = useProjects();

  useSessionsSync();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border pb-px">
        {!projects && isLoading && <ProjectNavigator.HeaderSkeleton />}
        {error && (
          <div className="px-3 py-2 bg-bg text-xs text-red-500">Failed to load projects</div>
        )}
        {projects && projects.length === 0 && (
          <div className="px-3 py-2 bg-bg text-xs text-text-muted">No projects yet</div>
        )}
        {projects?.map((project) => (
          <ProjectSessionsList
            key={project.id}
            project={project}
            selectedSessionId={selectedSessionId}
          />
        ))}
      </div>
    </div>
  );
}
