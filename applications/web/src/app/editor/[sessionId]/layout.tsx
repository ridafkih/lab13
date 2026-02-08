"use client";

import type { ReactNode } from "react";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { BrowserStreamProvider } from "@/components/browser-stream";
import { SessionInfoView } from "@/components/session-info-view";
import { useProjects, useSession, useDeleteSession } from "@/lib/hooks";
import { fetchChannelSnapshot } from "@/lib/api";
import { useMultiplayer } from "@/lib/multiplayer";
import type { Session, Project } from "@lab/client";

type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

function useSessionData(sessionId: string) {
  const { data: projects } = useProjects();
  const { data: session } = useSession(sessionId);

  if (!projects || !session) {
    return { data: null };
  }

  const project = projects.find(({ id }) => id === session.projectId);
  if (!project) {
    return { data: null };
  }

  return { data: { project, session } };
}

function useSessionContainers(sessionId: string) {
  const { data: initialContainers } = useSWR(`sessionContainers-${sessionId}`, () =>
    fetchChannelSnapshot<SessionContainer[]>("sessionContainers", sessionId),
  );

  const { useChannel } = useMultiplayer();
  const liveContainers = useChannel("sessionContainers", { uuid: sessionId });

  return liveContainers.length > 0 ? liveContainers : (initialContainers ?? []);
}

type SessionLayoutProps = {
  children: ReactNode;
  params: Promise<{ sessionId: string }>;
};

export default function SessionLayout({ children, params }: SessionLayoutProps) {
  const router = useRouter();
  const { sessionId } = use(params);
  const { error: sessionError } = useSession(sessionId);
  const { data: sessionData } = useSessionData(sessionId);
  const containers = useSessionContainers(sessionId);

  const containerUrls = containers.flatMap((container) => container.urls.map(({ url }) => url));

  const contextValue = {
    sessionId,
    session: sessionData?.session ?? null,
    project: sessionData?.project ?? null,
    containers,
    containerUrls,
  };

  useEffect(() => {
    if (sessionError) {
      router.replace("/editor");
    }
  }, [sessionError, router]);

  if (sessionError) {
    return null;
  }

  return (
    <BrowserStreamProvider sessionId={sessionId}>
      <SessionContext.Provider value={contextValue}>
        <div className="h-full grid grid-cols-[2fr_1fr]">
          <div className="border-r border-border min-w-0 min-h-0">{children}</div>
          <SessionInfoPanel />
        </div>
      </SessionContext.Provider>
    </BrowserStreamProvider>
  );
}

function SessionInfoPanel() {
  const router = useRouter();
  const { session, project, containers } = useSessionContext();
  const deleteSession = useDeleteSession();

  const handleDelete = () => {
    if (!session) return;
    deleteSession(session, () => router.push("/editor"));
  };

  if (!session || !project) {
    return null;
  }

  return (
    <div className="min-w-64 bg-bg z-20 overflow-y-auto">
      <SessionInfoView
        session={session}
        project={project}
        containers={containers}
        onDelete={handleDelete}
      />
    </div>
  );
}

import { createContext, useContext } from "react";

type SessionContextValue = {
  sessionId: string;
  session: Session | null;
  project: Project | null;
  containers: SessionContainer[];
  containerUrls: string[];
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionContext must be used within SessionLayout");
  }
  return context;
}

export type { SessionContainer };
