"use client";

import type { ReactNode } from "react";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { BrowserStreamProvider } from "@/components/browser-stream";
import { useProjects, useSession } from "@/lib/hooks";
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

  useEffect(() => {
    if (sessionError) {
      router.replace("/editor");
    }
  }, [sessionError, router]);

  if (sessionError) {
    return null;
  }

  const containerUrls = containers.flatMap((container) => container.urls.map(({ url }) => url));

  return (
    <BrowserStreamProvider sessionId={sessionId}>
      <SessionContext.Provider
        value={{
          sessionId,
          session: sessionData?.session ?? null,
          project: sessionData?.project ?? null,
          containers,
          containerUrls,
        }}
      >
        {children}
      </SessionContext.Provider>
    </BrowserStreamProvider>
  );
}

// Context for session data
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
