"use client";

import { Suspense, use } from "react";
import { Chat } from "@/components/chat";
import { StatusIcon } from "@/components/status-icon";
import { Breadcrumb } from "@/components/breadcrumb";
import { NavTabs } from "@/components/nav-tabs";
import { ChatTabContent } from "@/components/chat-tab-content";
import { ReviewTabContent } from "@/components/review-tab-content";
import { FrameTabContent } from "@/components/frame-tab-content";
import { StreamTabContent } from "@/components/stream-tab-content";
import { ChatLoadingFallback } from "@/components/suspense-fallbacks";
import { PageFrame, Header, PageContent } from "@/components/layout-primitives";
import { useAgent } from "@/lib/use-agent";
import { useQuestions } from "@/lib/use-questions";
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
      return (
        <Chat.Provider key={`stream-${sessionId}`} onSubmit={sendMessage} onAbort={abortSession}>
          <StreamTabContent />
        </Chat.Provider>
      );
    default:
      return null;
  }
}

type TabPageProps = {
  params: Promise<{ sessionId: string; tab: string }>;
};

export default function TabPage({ params }: TabPageProps) {
  const { tab } = use(params);
  const validTabs: TabValue[] = ["chat", "review", "frame", "stream"];
  const currentTab = validTabs.includes(tab as TabValue) ? (tab as TabValue) : "chat";

  return (
    <PageFrame position="relative">
      <SessionHeader />
      <SessionTabs />
      <PageContent display="flex">
        <Suspense fallback={<ChatLoadingFallback />}>
          <TabContent tab={currentTab} />
        </Suspense>
      </PageContent>
    </PageFrame>
  );
}
