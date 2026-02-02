"use client";

import { createContext, use, type ReactNode } from "react";
import Link from "next/link";
import type { Session } from "@lab/client";
import { useMultiplayer } from "@/lib/multiplayer";
import { useSessionStatus, type SessionStatus } from "@/lib/use-session-status";
import { useSessionTitle } from "@/lib/use-session-title";
import { prefetchSessionMessages } from "@/lib/use-agent";
import { prefetchSessionContainers } from "@/lib/api";
import { prefetchFileStatuses } from "@/lib/use-file-statuses";
import { StatusIcon } from "./status-icon";
import { Hash } from "./hash";
import { ProjectNavigator } from "./project-navigator-list";

interface SessionItemContextValue {
  session: Session;
  sessionId: string;
  title: string | null;
  status: SessionStatus;
  lastMessage?: string;
  prefetch: () => void;
}

const SessionItemContext = createContext<SessionItemContextValue | null>(null);

function useSessionItemContext() {
  const context = use(SessionItemContext);
  if (!context) {
    throw new Error("SessionItem components must be used within SessionItem.Provider");
  }
  return context;
}

interface ProviderProps {
  session: Session;
  children: ReactNode;
}

function SessionItemProvider({ session, children }: ProviderProps) {
  const { useChannel } = useMultiplayer();
  const metadata = useChannel("sessionMetadata", { uuid: session.id });
  const status = useSessionStatus(session);
  const title = useSessionTitle(session.id, session.title);

  const prefetch = () => {
    prefetchSessionMessages(session.id);
    prefetchSessionContainers(session.id);
    prefetchFileStatuses(session.id);
  };

  return (
    <SessionItemContext
      value={{
        session,
        sessionId: session.id,
        title,
        status,
        lastMessage: metadata.lastMessage,
        prefetch,
      }}
    >
      {children}
    </SessionItemContext>
  );
}

function SessionItemStatus() {
  const { status } = useSessionItemContext();
  return <StatusIcon status={status} />;
}

function SessionItemHash() {
  const { sessionId } = useSessionItemContext();
  return <Hash>{sessionId.slice(0, 6)}</Hash>;
}

function SessionItemTitle() {
  const { title } = useSessionItemContext();
  return <ProjectNavigator.ItemTitle empty={!title}>{title}</ProjectNavigator.ItemTitle>;
}

function SessionItemLastMessage() {
  const { lastMessage } = useSessionItemContext();
  return <ProjectNavigator.ItemDescription>{lastMessage}</ProjectNavigator.ItemDescription>;
}

interface SessionItemLinkProps {
  children: ReactNode;
  className?: string;
}

function SessionItemLink({ children, className }: SessionItemLinkProps) {
  const { sessionId, prefetch } = useSessionItemContext();

  return (
    <Link href={`/editor/${sessionId}/chat`} className={className} onMouseDown={prefetch}>
      {children}
    </Link>
  );
}

export const SessionItem = {
  Provider: SessionItemProvider,
  Link: SessionItemLink,
  Status: SessionItemStatus,
  Hash: SessionItemHash,
  Title: SessionItemTitle,
  LastMessage: SessionItemLastMessage,
  useContext: useSessionItemContext,
};
