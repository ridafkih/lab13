"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Session } from "@lab/client";
import { tv } from "tailwind-variants";
import { useProjects, useSessions, useCreateSession, useSessionCreation } from "@/lib/hooks";
import { useSessionsSync } from "@/lib/use-sessions-sync";
import { StatusIcon } from "./status-icon";
import { IconButton } from "./icon-button";
import { SessionItem } from "./session-item";

const row = tv({
  base: "flex items-center gap-2 py-2",
  variants: {
    type: {
      project: "text-text-secondary cursor-default",
      session: "hover:brightness-75 cursor-pointer",
    },
  },
});

function SessionListRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function SessionListProject({ project, children }: { project: Project; children?: ReactNode }) {
  const router = useRouter();
  const { data: sessions } = useSessions(project.id);
  const createSession = useCreateSession();
  const [creationState, setCreationState] = useSessionCreation();

  const sessionCount = sessions?.length ?? 0;
  const isCreatingHere = creationState.isCreating && creationState.projectId === project.id;
  const showSkeleton = isCreatingHere && sessionCount === creationState.sessionCountAtCreation;

  useEffect(() => {
    if (!isCreatingHere || !sessions) return;
    if (sessionCount <= creationState.sessionCountAtCreation) return;

    const newSession = sessions[sessions.length - 1];
    if (!newSession) return;

    router.push(`/editor/${newSession.id}/chat`);
    setCreationState({ isCreating: false, projectId: null, sessionCountAtCreation: 0 });
  }, [
    isCreatingHere,
    sessions,
    sessionCount,
    creationState.sessionCountAtCreation,
    router,
    setCreationState,
  ]);

  const handleAddSession = (event: React.MouseEvent) => {
    event.stopPropagation();
    createSession(project.id, { currentSessionCount: sessionCount });
  };

  return (
    <div>
      <div className={row({ type: "project" })}>
        <Box size={14} className="shrink-0" />
        <span className="font-medium text-nowrap">{project.name}</span>
        <span className="text-text-muted text-xs">{sessionCount}</span>
        <IconButton
          onClick={handleAddSession}
          className="ml-auto opacity-0 group-hover:opacity-100"
        >
          <Plus size={14} />
        </IconButton>
      </div>
      {children}
      {showSkeleton && (
        <div className={row({ type: "session" })}>
          <StatusIcon status="starting" />
          <span className="text-text-muted italic">Spawning Session...</span>
        </div>
      )}
    </div>
  );
}

function SessionListItem({ session }: { session: Session }) {
  return (
    <SessionItem.Provider session={session}>
      <SessionItem.Link className={row({ type: "session" })}>
        <div className="max-w-1/2 flex items-center gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <SessionItem.Status />
            <SessionItem.Hash />
          </div>
          <SessionItem.Title />
        </div>
        <div className="overflow-hidden flex grow justify-end">
          <SessionItem.LastMessage />
        </div>
      </SessionItem.Link>
    </SessionItem.Provider>
  );
}

function SessionListEmpty() {
  return <div className="text-text-muted text-sm py-4 text-center">No projects yet</div>;
}

function SessionListLoading() {
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 py-2 text-text-muted">
        <div className="h-3.5 w-3.5 rounded-full bg-bg-hover animate-pulse" />
        <div className="h-3 w-24 rounded bg-bg-hover animate-pulse" />
      </div>
    </div>
  );
}

function SessionListView() {
  const { data: projects, isLoading } = useProjects();

  useSessionsSync();

  if (isLoading) {
    return <SessionListLoading />;
  }

  if (!projects || projects.length === 0) {
    return <SessionListEmpty />;
  }

  return (
    <SessionListRoot>
      {projects.map((project) => (
        <SessionListProject key={project.id} project={project}>
          <SessionListSessions projectId={project.id} />
        </SessionListProject>
      ))}
    </SessionListRoot>
  );
}

function SessionListSessions({ projectId }: { projectId: string }) {
  const { data: sessions } = useSessions(projectId);

  if (!sessions || sessions.length === 0) {
    return null;
  }

  return (
    <>
      {sessions.map((session) => (
        <SessionListItem key={session.id} session={session} />
      ))}
    </>
  );
}

export const SessionList = {
  Root: SessionListRoot,
  Project: SessionListProject,
  Item: SessionListItem,
  Sessions: SessionListSessions,
  Empty: SessionListEmpty,
  Loading: SessionListLoading,
  View: SessionListView,
};
