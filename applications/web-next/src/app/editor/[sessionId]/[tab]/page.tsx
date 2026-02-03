"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { Chat } from "@/components/chat";
import { StatusIcon } from "@/components/status-icon";
import { Breadcrumb } from "@/components/breadcrumb";
import { NavTabs } from "@/components/nav-tabs";
import { ChatTabContent } from "@/components/chat-tab-content";
import { ReviewTabContent } from "@/components/review-tab-content";
import { FrameTabContent } from "@/components/frame-tab-content";
import { StreamTabContent } from "@/components/stream-tab-content";
import { SessionInfoView } from "@/components/session-info-view";
import { ChatLoadingFallback } from "@/components/suspense-fallbacks";
import { PageFrame, Header, PageContent } from "@/components/layout-primitives";
import { useAgent } from "@/lib/use-agent";
import { useQuestions } from "@/lib/use-questions";
import { useDeleteSession } from "@/lib/hooks";
import { useSessionStatus } from "@/lib/use-session-status";
import { useSessionTitle } from "@/lib/use-session-title";
import { useSessionContext } from "../layout";

type TabValue = "chat" | "review" | "frame" | "stream";

function SessionHeader() {
  const { session, project, sessionId } = useSessionContext();
  const status = useSessionStatus(session);
  const displayTitle = useSessionTitle(sessionId, session?.title);

  return (
    <Header>
      <StatusIcon status={status} />
      <Breadcrumb.Root>
        <Breadcrumb.MutedItem>{project?.name}</Breadcrumb.MutedItem>
        <Breadcrumb.Separator />
        {displayTitle ? (
          <Breadcrumb.Item>{displayTitle}</Breadcrumb.Item>
        ) : (
          <Breadcrumb.Item muted>Unnamed Session</Breadcrumb.Item>
        )}
      </Breadcrumb.Root>
    </Header>
  );
}

function SessionTabs() {
  const { sessionId } = useSessionContext();

  return (
    <NavTabs.List>
      <NavTabs.Tab href={`/editor/${sessionId}/chat`}>Chat</NavTabs.Tab>
      <NavTabs.Tab href={`/editor/${sessionId}/review`}>Review</NavTabs.Tab>
      <NavTabs.Tab href={`/editor/${sessionId}/frame`}>Frame</NavTabs.Tab>
      <NavTabs.Tab href={`/editor/${sessionId}/stream`}>Stream</NavTabs.Tab>
    </NavTabs.List>
  );
}

function TabContent({ tab }: { tab: TabValue }) {
  const { sessionId, containerUrls } = useSessionContext();
  const { messages, sendMessage, abortSession, sessionStatus, questionRequests } =
    useAgent(sessionId);
  const {
    reply: replyToQuestion,
    reject: rejectQuestion,
    isSubmitting: isQuestionSubmitting,
  } = useQuestions(sessionId);

  switch (tab) {
    case "chat":
      return (
        <Chat.Provider key={sessionId} onSubmit={sendMessage} onAbort={abortSession}>
          <ChatTabContent
            messages={messages}
            onQuestionReply={replyToQuestion}
            onQuestionReject={rejectQuestion}
            isQuestionSubmitting={isQuestionSubmitting}
            sessionStatus={sessionStatus}
            onAbort={abortSession}
            questionRequests={questionRequests}
          />
        </Chat.Provider>
      );
    case "review":
      return <ReviewTabContent sessionId={sessionId} />;
    case "frame":
      return <FrameTabContent frameUrl={containerUrls[0]} />;
    case "stream":
      return <StreamTabContent />;
    default:
      return null;
  }
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

type TabPageProps = {
  params: Promise<{ sessionId: string; tab: string }>;
};

export default function TabPage({ params }: TabPageProps) {
  const { tab } = use(params);
  const validTabs: TabValue[] = ["chat", "review", "frame", "stream"];
  const currentTab = validTabs.includes(tab as TabValue) ? (tab as TabValue) : "chat";

  return (
    <div className="h-full grid grid-cols-[2fr_1fr]">
      <div className="border-r border-border min-w-0 min-h-0">
        <PageFrame position="relative">
          <SessionHeader />
          <SessionTabs />
          <PageContent display="flex">
            <Suspense fallback={<ChatLoadingFallback />}>
              <TabContent tab={currentTab} />
            </Suspense>
          </PageContent>
        </PageFrame>
      </div>
      <SessionInfoPanel />
    </div>
  );
}
