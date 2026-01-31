"use client";

import { useState, useEffect } from "react";
import { useSWRConfig } from "swr";
import { AppView, useAppView } from "@/components/app-view";
import { Nav } from "@/components/nav";
import { Chat, useChat } from "@/components/chat";
import { Settings } from "@/components/settings";
import { MessagePart } from "@/components/message-part";
import { Orchestration, useOrchestration } from "@/components/orchestration";
import { ProjectNavigator } from "@/components/project-navigator-list";
import { Avatar } from "@/components/avatar";
import { StatusIcon } from "@/components/status-icon";
import { Hash } from "@/components/hash";
import { TextAreaGroup } from "@/components/textarea-group";
import { SplitPane, useSplitPane } from "@/components/split-pane";
import { SessionInfoPane } from "@/components/session-info-pane";
import { BrowserStreamProvider, BrowserStreamView } from "@/components/browser-stream";
import { UrlBar } from "@/components/url-bar";
import {
  navItems,
  mockReviewFiles,
  mockFileTree,
  mockFileTreeContents,
  mockFileContents,
} from "@/placeholder/data";
import {
  useProjects,
  useSessions,
  useSession,
  useCreateSession,
  useDeleteSession,
  useModels,
} from "@/lib/hooks";
import type { Project, Session } from "@lab/client";
import {
  Review,
  type ReviewableFile,
  type BrowserState,
  type BrowserActions,
  type FileNode,
} from "@/components/review";
import { defaultModel } from "@/placeholder/models";
import { Trash2 } from "lucide-react";
import { useMultiplayer } from "@/lib/multiplayer";
import { useAgent, prefetchSessionMessages, type MessageState } from "@/lib/use-agent";

function SessionItem({ session }: { session: Session }) {
  const { selected, select } = useSplitPane();
  const isTemp = session.id.startsWith("temp-");
  const hasStartingContainer = session.containers?.some(
    (container) => container.status === "starting",
  );

  const isLoading = session.status === "creating" || hasStartingContainer;
  const displayStatus = isLoading ? "loading" : session.status;

  const handleMouseDown = () => {
    if (isTemp) return;
    prefetchSessionMessages(session.id);
  };

  return (
    <ProjectNavigator.Item
      selected={selected === session.id}
      onClick={() => select(session.id)}
      onMouseDown={handleMouseDown}
    >
      <StatusIcon status={displayStatus} />
      {isTemp ? <ProjectNavigator.ItemSkeletonBlock /> : <Hash>{session.id.slice(0, 6)}</Hash>}
      {session.title ? (
        <ProjectNavigator.ItemTitle>{session.title}</ProjectNavigator.ItemTitle>
      ) : (
        <ProjectNavigator.ItemEmptyTitle>Unnamed Session</ProjectNavigator.ItemEmptyTitle>
      )}
      <ProjectNavigator.ItemDescription />
      <Avatar />
    </ProjectNavigator.Item>
  );
}

function ProjectSessionsList({ project }: { project: Project }) {
  const { select } = useSplitPane();
  const { data: sessions } = useSessions(project.id);
  const createSession = useCreateSession();

  const handleAddSession = () => {
    createSession(project.id, { onCreated: select });
  };

  return (
    <ProjectNavigator.List>
      <ProjectNavigator.Header onAdd={handleAddSession}>
        <ProjectNavigator.HeaderName>{project.name}</ProjectNavigator.HeaderName>
        <ProjectNavigator.HeaderCount>{sessions?.length ?? 0}</ProjectNavigator.HeaderCount>
      </ProjectNavigator.Header>
      {sessions?.map((session) => (
        <SessionItem key={session.id} session={session} />
      ))}
    </ProjectNavigator.List>
  );
}

function ProjectNavigatorView({ children }: { children?: React.ReactNode }) {
  const { data: projects, isLoading, error } = useProjects();

  return (
    <div className="flex-1 overflow-y-auto flex flex-col justify-between">
      <div className="flex flex-col gap-px bg-border pb-px">
        {isLoading && (
          <div className="px-3 py-2 bg-bg text-xs text-text-muted">Loading projects...</div>
        )}
        {error && (
          <div className="px-3 py-2 bg-bg text-xs text-red-500">Failed to load projects</div>
        )}
        {projects && projects.length === 0 && (
          <div className="px-3 py-2 bg-bg text-xs text-text-muted">No projects yet</div>
        )}
        {projects?.map((project) => (
          <ProjectSessionsList key={project.id} project={project} />
        ))}
      </div>
      {children}
    </div>
  );
}

function isCachedArray<T>(value: unknown): value is { data: T[] } {
  return (
    typeof value === "object" && value !== null && "data" in value && Array.isArray(value.data)
  );
}

function useSessionData(sessionId: string | null) {
  const { data: projects } = useProjects();
  const { cache } = useSWRConfig();

  if (!sessionId || !projects) {
    return { data: null };
  }

  for (const project of projects) {
    const cached = cache.get(`sessions-${project.id}`);
    if (!isCachedArray<Session>(cached)) continue;

    const session = cached.data.find((existing) => existing.id === sessionId);
    if (session) {
      return { data: { project, session } };
    }
  }

  return { data: null };
}

function useMockFileBrowser(sessionId: string | null) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedContents, setLoadedContents] = useState<Map<string, FileNode[]>>(new Map());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  useEffect(() => {
    setExpandedPaths(new Set());
    setLoadedContents(new Map());
    setSelectedPath(null);
    setPreviewContent(null);
  }, [sessionId]);

  const state: BrowserState = {
    rootNodes: mockFileTree,
    expandedPaths,
    loadedContents,
    loadingPaths: new Set(),
    rootLoading: false,
    selectedPath,
    previewContent,
    previewLoading: false,
  };

  const actions: BrowserActions = {
    toggleDirectory: (path) => {
      if (expandedPaths.has(path)) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      if (!loadedContents.has(path) && mockFileTreeContents[path]) {
        setLoadedContents((prev) => new Map(prev).set(path, mockFileTreeContents[path]));
      }
      setExpandedPaths((prev) => new Set([...prev, path]));
    },
    selectFile: (path) => {
      setSelectedPath(path);
      setPreviewContent(mockFileContents[path] ?? "// File not found");
    },
    clearFileSelection: () => {
      setSelectedPath(null);
      setPreviewContent(null);
    },
  };

  return { state, actions };
}

function useReviewFiles(sessionId: string | null) {
  const [files, setFiles] = useState<ReviewableFile[]>([]);

  useEffect(() => {
    const initialFiles = sessionId ? (mockReviewFiles[sessionId] ?? []) : [];
    setFiles(initialFiles);
  }, [sessionId]);

  const dismiss = (path: string) => {
    setFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, status: "dismissed" as const } : file)),
    );
  };

  const pendingFiles = files.filter((file) => file.status === "pending");

  return { files, pendingFiles, dismiss };
}

function ReviewFeedbackForm() {
  return (
    <Review.Feedback>
      <Review.FeedbackHeader>
        <Review.FeedbackLocation />
      </Review.FeedbackHeader>
      <TextAreaGroup.Input placeholder="Your feedback will be submitted to the agent..." rows={2} />
      <TextAreaGroup.Toolbar>
        <TextAreaGroup.Submit />
      </TextAreaGroup.Toolbar>
    </Review.Feedback>
  );
}

function ReviewTabContent({ sessionId }: { sessionId: string }) {
  const { files, pendingFiles, dismiss } = useReviewFiles(sessionId);
  const browser = useMockFileBrowser(sessionId);

  return (
    <Review.Provider files={files} onDismiss={dismiss} browser={browser}>
      <Review.Frame>
        <Review.MainPanel>
          <Review.Empty />
          <Review.DiffView>
            <Review.DiffHeader />
            <Review.DiffList>
              {pendingFiles.map((file) => (
                <Review.DiffItem key={file.path} file={file}>
                  <Review.FileHeader>
                    <Review.FileHeaderIcon />
                    <Review.FileHeaderLabel />
                    <Review.FileHeaderDismiss />
                  </Review.FileHeader>
                  <Review.Diff />
                </Review.DiffItem>
              ))}
            </Review.DiffList>
            <ReviewFeedbackForm />
          </Review.DiffView>
          <Review.PreviewHeader />
          <Review.PreviewView>
            <Review.PreviewContent />
            <ReviewFeedbackForm />
          </Review.PreviewView>
        </Review.MainPanel>
        <Review.SidePanel>
          <Review.Browser>
            <Review.BrowserHeader />
            <Review.BrowserTree />
          </Review.Browser>
        </Review.SidePanel>
      </Review.Frame>
    </Review.Provider>
  );
}

function ChatTabContent({ messages }: { messages: MessageState[] }) {
  const { data: modelGroups } = useModels();
  const { state, actions } = useChat();

  useEffect(() => {
    if (modelGroups && !state.modelId) {
      const firstModel = modelGroups[0]?.models[0];
      if (firstModel) actions.setModelId(firstModel.value);
    }
  }, [modelGroups, state.modelId, actions]);

  return (
    <Chat.MessageList>
      <Chat.Messages>
        {messages.flatMap((message) =>
          message.parts.map((part) => (
            <Chat.Block key={part.id} role={message.role}>
              <MessagePart.Root
                part={part}
                isStreaming={
                  message.role === "assistant" && message === messages[messages.length - 1]
                }
              />
            </Chat.Block>
          )),
        )}
      </Chat.Messages>
      <Chat.Input>
        {modelGroups && state.modelId && (
          <TextAreaGroup.ModelSelector
            value={state.modelId}
            groups={modelGroups}
            onChange={actions.setModelId}
          />
        )}
      </Chat.Input>
    </Chat.MessageList>
  );
}

function FrameTabContent({ frameUrl }: { frameUrl: string | undefined }) {
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);

  const handleRefresh = () => {
    setIsLoading(true);
    setKey((key) => key + 1);
  };

  if (!frameUrl) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center p-4 bg-bg-muted">
          <div className="text-text-muted text-sm">No container URL available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <UrlBar url={frameUrl} isLoading={isLoading} onRefresh={handleRefresh} />
      <iframe
        key={key}
        src={frameUrl}
        className="flex-1 border-none"
        onLoad={() => setIsLoading(false)}
        title="Frame"
      />
    </div>
  );
}

function StreamTabContent() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 flex items-center justify-center p-4 bg-bg-muted">
        <div className="w-full max-w-4xl">
          <BrowserStreamView />
        </div>
      </div>
    </div>
  );
}

type SessionData = { project: Project; session: Session } | null;
type SessionContainer = {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  urls: { port: number; url: string }[];
};

function ConversationView({
  sessionId,
  sessionData,
  containers,
}: {
  sessionId: string | null;
  sessionData: SessionData;
  containers: SessionContainer[];
}) {
  const { messages, sendMessage } = useAgent(sessionId ?? "");
  const containerUrls = containers.flatMap((container) => container.urls.map(({ url }) => url));

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        Select a session to preview
      </div>
    );
  }

  const project = sessionData?.project;
  const session = sessionData?.session;

  return (
    <Chat.Provider key={sessionId} onSubmit={sendMessage}>
      <Chat.Frame>
        <Chat.Header>
          <StatusIcon status={session?.status ?? "idle"} />
          <Chat.HeaderBreadcrumb>
            <Chat.HeaderProject>{project?.name}</Chat.HeaderProject>
            <Chat.HeaderDivider />
            {session?.title ? (
              <Chat.HeaderTitle>{session.title}</Chat.HeaderTitle>
            ) : (
              <Chat.HeaderEmptyTitle>Unnamed Session</Chat.HeaderEmptyTitle>
            )}
          </Chat.HeaderBreadcrumb>
        </Chat.Header>
        <Chat.Tabs>
          <Chat.TabList>
            <Chat.Tab value="chat">Chat</Chat.Tab>
            <Chat.Tab value="review">Review</Chat.Tab>
            <Chat.Tab value="frame">Frame</Chat.Tab>
            <Chat.Tab value="stream">Stream</Chat.Tab>
          </Chat.TabList>
          <Chat.TabContent value="chat">
            <ChatTabContent messages={messages} />
          </Chat.TabContent>
          <Chat.TabContent value="review">
            <ReviewTabContent sessionId={sessionId!} />
          </Chat.TabContent>
          <Chat.TabContent value="frame">
            <FrameTabContent frameUrl={containerUrls[0]} />
          </Chat.TabContent>
          <Chat.TabContent value="stream">
            <StreamTabContent />
          </Chat.TabContent>
        </Chat.Tabs>
      </Chat.Frame>
    </Chat.Provider>
  );
}

function SessionInfoView({
  session,
  project,
  containers,
  onDelete,
}: {
  session: Session;
  project: Project;
  containers: SessionContainer[];
  onDelete: () => void;
}) {
  const links = containers.flatMap((container) => container.urls.map(({ url }) => url));

  const projectContainers = project.containers ?? [];
  const hasSessionContainers = containers.length > 0;

  return (
    <SessionInfoPane.Root>
      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Changed Files</SessionInfoPane.SectionHeader>
        <SessionInfoPane.Empty>No changed files</SessionInfoPane.Empty>
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
        {links.length > 0 ? (
          links.map((url) => <SessionInfoPane.LinkItem key={url} href={url} />)
        ) : (
          <SessionInfoPane.Empty>No links</SessionInfoPane.Empty>
        )}
      </SessionInfoPane.Section>

      <SessionInfoPane.Stream>
        <BrowserStreamView />
      </SessionInfoPane.Stream>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Logs</SessionInfoPane.SectionHeader>
        <SessionInfoPane.Empty>No logs</SessionInfoPane.Empty>
      </SessionInfoPane.Section>

      <SessionInfoPane.Section>
        <SessionInfoPane.SectionHeader>Controls</SessionInfoPane.SectionHeader>
        <SessionInfoPane.ActionButton icon={Trash2} variant="danger" onClick={onDelete}>
          Delete
        </SessionInfoPane.ActionButton>
      </SessionInfoPane.Section>
    </SessionInfoPane.Root>
  );
}

function PromptArea() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel);
  const { data: modelGroups } = useModels();
  const orchestration = useOrchestration();

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const id = orchestration.add({ status: "thinking" });
    setPrompt("");

    await new Promise((resolve) => setTimeout(resolve, 1500));
    orchestration.update(id, { status: "delegating" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.update(id, { status: "starting", projectName: "opencode-web" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.remove(id);
  };

  return (
    <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-linear-to-t from-bg to-transparent pointer-events-none">
      <Orchestration.List />
      <TextAreaGroup.Provider
        state={{ value: prompt }}
        actions={{
          onChange: setPrompt,
          onSubmit: handleSubmit,
        }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input />
          <TextAreaGroup.Toolbar>
            {modelGroups && (
              <TextAreaGroup.ModelSelector value={model} groups={modelGroups} onChange={setModel} />
            )}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

function SettingsView() {
  return (
    <Settings.Frame>
      <Settings.Header />
      <Settings.Content />
    </Settings.Frame>
  );
}

function AppViewContent({ selected }: { selected: string | null }) {
  const { view } = useAppView();
  const { select } = useSplitPane();
  const { data: sessionData } = useSessionData(selected);
  const deleteSession = useDeleteSession();
  const { useChannel } = useMultiplayer();
  const containers = useChannel("sessionContainers", { uuid: selected ?? "" });

  const handleDelete = () => {
    if (!sessionData) return;
    deleteSession(sessionData.session, () => select(null));
  };

  if (view === "settings") {
    return <SettingsView />;
  }

  if (!sessionData) {
    return (
      <div className="flex h-full">
        <div className="flex-1 min-w-0 border-r border-border">
          <ConversationView sessionId={selected} sessionData={null} containers={[]} />
        </div>
      </div>
    );
  }

  return (
    <BrowserStreamProvider sessionId={sessionData.session.id}>
      <div className="flex h-full">
        <div className="flex-1 min-w-0 border-r border-border">
          <ConversationView
            sessionId={selected}
            sessionData={sessionData}
            containers={containers}
          />
        </div>
        <div className="min-w-64 shrink-0">
          <SessionInfoView
            session={sessionData.session}
            project={sessionData.project}
            containers={containers}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </BrowserStreamProvider>
  );
}

export default function Page() {
  return (
    <AppView.Provider>
      <Orchestration.Provider>
        <div className="flex flex-col h-screen">
          <Nav items={navItems} />
          <SplitPane.Root>
            <SplitPane.Primary>
              <ProjectNavigatorView>
                <PromptArea />
              </ProjectNavigatorView>
            </SplitPane.Primary>
            <SplitPane.Secondary>
              {(selected) => <AppViewContent selected={selected} />}
            </SplitPane.Secondary>
          </SplitPane.Root>
        </div>
      </Orchestration.Provider>
    </AppView.Provider>
  );
}
