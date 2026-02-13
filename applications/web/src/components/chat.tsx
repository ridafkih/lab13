"use client";

import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { tv } from "tailwind-variants";
import { type Attachment, useAttachments } from "@/lib/use-attachments";
import { Header, PageFrame } from "./layout-primitives";
import { Tabs } from "./tabs";
import { TextAreaGroup } from "./textarea-group";

type ChatRole = "user" | "assistant";

interface SubmitOptions {
  content: string;
  modelId?: string;
  attachments?: Attachment[];
}

interface ChatInputState {
  attachments: Attachment[];
}

interface ChatInputActions {
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
}

interface ChatInputContextValue {
  state: ChatInputState;
  actions: ChatInputActions;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isDragging: boolean;
  dragHandlers: ReturnType<typeof useAttachments>["dragHandlers"];
}

interface ChatContextValue {
  getScrollRef: () => RefObject<HTMLDivElement | null>;
  getIsNearBottomRef: () => RefObject<boolean>;
  scrollToBottom: (force?: boolean) => void;
  getModelId: () => string | null;
  setModelId: (value: string) => void;
}

const ChatInputContext = createContext<ChatInputContextValue | null>(null);
const ChatContext = createContext<ChatContextValue | null>(null);

function useChatInput() {
  const context = use(ChatInputContext);
  if (!context) {
    throw new Error("Chat input components must be used within Chat.Provider");
  }
  return context;
}

function useChat() {
  const context = use(ChatContext);
  if (!context) {
    throw new Error("Chat components must be used within Chat.Provider");
  }
  return context;
}

const SCROLL_THRESHOLD = 100;

function getDistanceFromBottom(element: HTMLDivElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

interface ChatProviderProps {
  children: ReactNode;
  defaultModelId?: string;
  onSubmit?: (options: SubmitOptions) => void;
  onAbort?: () => void;
  onModelChange?: (modelId: string) => void | Promise<void>;
}

function ChatProvider({
  children,
  defaultModelId,
  onSubmit,
  onAbort,
  onModelChange,
}: ChatProviderProps) {
  const [modelId, setModelId] = useState(defaultModelId ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isDragging,
    dragHandlers,
  } = useAttachments();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;

  const handleSubmit = () => {
    const currentInput = inputRef.current?.value ?? "";
    const currentAttachments = attachmentsRef.current;
    const currentModelId = modelIdRef.current;

    const hasContent = currentInput.trim().length > 0;
    const hasAttachments = currentAttachments.length > 0;
    const readyAttachments = currentAttachments.filter(
      (attachment) => attachment.status === "ready"
    );

    if (!(hasContent || hasAttachments)) {
      return;
    }

    onSubmit?.({
      content: currentInput,
      modelId: currentModelId ?? undefined,
      attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
    });

    if (inputRef.current) {
      inputRef.current.value = "";
    }
    clearAttachments();
    isNearBottomRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  };

  const handleAbort = () => {
    onAbort?.();
  };

  const chatContextValue = useRef<ChatContextValue | null>(null);
  if (!chatContextValue.current) {
    chatContextValue.current = {
      getScrollRef: () => scrollRef,
      getIsNearBottomRef: () => isNearBottomRef,
      scrollToBottom: (force = false) => {
        if (!(force || isNearBottomRef.current)) {
          return;
        }
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      },
      getModelId: () => modelIdRef.current,
      setModelId: (value: string) => {
        setModelId(value);
        void onModelChange?.(value);
      },
    };
  }

  const chatInputContextValue = useRef<ChatInputContextValue | null>(null);
  if (!chatInputContextValue.current) {
    chatInputContextValue.current = {
      state: { attachments: [] },
      actions: {
        addFiles,
        removeAttachment,
        onSubmit: handleSubmit,
        onAbort: handleAbort,
      },
      inputRef,
      isDragging: false,
      dragHandlers,
    };
  }
  chatInputContextValue.current.state.attachments = attachments;
  chatInputContextValue.current.actions.onSubmit = handleSubmit;
  chatInputContextValue.current.actions.onAbort = handleAbort;
  chatInputContextValue.current.isDragging = isDragging;

  return (
    <ChatContext value={chatContextValue.current}>
      <ChatInputContext value={chatInputContextValue.current}>
        {children}
      </ChatInputContext>
    </ChatContext>
  );
}

function ChatFrame({ children }: { children: ReactNode }) {
  return <PageFrame position="relative">{children}</PageFrame>;
}

function ChatHeader({ children }: { children: ReactNode }) {
  return <Header>{children}</Header>;
}

function ChatHeaderBreadcrumb({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1 overflow-x-hidden">{children}</div>
  );
}

function ChatHeaderDivider() {
  return <span className="text-text-muted">/</span>;
}

function ChatHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="overflow-x-hidden truncate text-nowrap font-medium text-text">
      {children}
    </span>
  );
}

function ChatHeaderEmptyTitle({ children }: { children: ReactNode }) {
  return (
    <span className="overflow-x-hidden truncate text-nowrap text-text-muted italic">
      {children}
    </span>
  );
}

type ChatTab = "chat" | "review" | "frame" | "stream";

function ChatTabs({
  children,
  defaultTab = "chat",
}: {
  children: ReactNode;
  defaultTab?: ChatTab;
}) {
  return <Tabs.Root defaultTab={defaultTab}>{children}</Tabs.Root>;
}

function ChatTabItem({
  value,
  children,
}: {
  value: ChatTab;
  children: ReactNode;
}) {
  return <Tabs.Tab value={value}>{children}</Tabs.Tab>;
}

function ChatTabContent({
  value,
  children,
}: {
  value: ChatTab;
  children: ReactNode;
}) {
  return <Tabs.Content value={value}>{children}</Tabs.Content>;
}

const messageList = tv({
  base: "flex flex-col overflow-y-auto",
  variants: {
    compact: {
      false: "flex-1",
    },
  },
  defaultVariants: {
    compact: false,
  },
});

function ChatMessageList({
  children,
  compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const { getScrollRef, getIsNearBottomRef } = useChat();
  const scrollRef = getScrollRef();
  const isNearBottomRef = getIsNearBottomRef();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = () => {
    const { current: element } = scrollRef;
    if (!element) {
      return;
    }
    isNearBottomRef.current =
      getDistanceFromBottom(element) <= SCROLL_THRESHOLD;
  };

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!(scrollElement && contentElement)) {
      return;
    }

    let frameId = 0;
    const scrollIfNearBottom = () => {
      const distanceFromBottom = getDistanceFromBottom(scrollElement);
      const shouldStick =
        isNearBottomRef.current || distanceFromBottom <= SCROLL_THRESHOLD;
      if (!shouldStick) {
        return;
      }
      scrollElement.scrollTo({ top: scrollElement.scrollHeight });
      isNearBottomRef.current = true;
    };
    const scheduleScroll = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        requestAnimationFrame(scrollIfNearBottom);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleScroll();
    });
    resizeObserver.observe(contentElement);
    const mutationObserver = new MutationObserver(() => {
      scheduleScroll();
    });
    mutationObserver.observe(contentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("resize", scheduleScroll);
    scheduleScroll();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleScroll);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [scrollRef, isNearBottomRef]);

  return (
    <div
      className={messageList({ compact })}
      onScroll={handleScroll}
      ref={scrollRef}
    >
      <div className="flex-1" />
      <div className="flex flex-col" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

function ChatMessages({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-px bg-border not-empty:pb-px">
      {children}
    </div>
  );
}

const block = tv({
  base: "empty:hidden",
  variants: {
    role: {
      user: "bg-bg",
      assistant: "bg-bg-muted",
    },
  },
});

function ChatBlock({
  role,
  children,
}: {
  role: ChatRole;
  children: ReactNode;
}) {
  return <div className={block({ role })}>{children}</div>;
}

function ChatInput({
  children,
  isSending,
  statusMessage,
}: {
  children?: ReactNode;
  isSending?: boolean;
  statusMessage?: string | null;
}) {
  const { state, actions, inputRef, isDragging, dragHandlers } = useChatInput();

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 bg-linear-to-t from-bg to-transparent p-4">
      {statusMessage && (
        <div className="pointer-events-auto mb-2 border border-amber-900 bg-amber-950 px-3 py-1.5 text-amber-500 text-xs">
          {statusMessage}
        </div>
      )}
      <TextAreaGroup.Provider
        actions={{
          onSubmit: actions.onSubmit,
          onAbort: actions.onAbort,
          onAddFiles: actions.addFiles,
          onRemoveAttachment: actions.removeAttachment,
        }}
        meta={{ textareaRef: inputRef, isSending, isDragging, dragHandlers }}
        state={{ attachments: state.attachments }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Attachments />
          <TextAreaGroup.Input placeholder="Send a message..." rows={2} />
          <TextAreaGroup.Toolbar>
            <TextAreaGroup.AttachButton />
            {children}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

const Chat = {
  Provider: ChatProvider,
  Frame: ChatFrame,
  Header: ChatHeader,
  HeaderBreadcrumb: ChatHeaderBreadcrumb,
  HeaderDivider: ChatHeaderDivider,
  HeaderTitle: ChatHeaderTitle,
  HeaderEmptyTitle: ChatHeaderEmptyTitle,
  Tabs: ChatTabs,
  TabList: Tabs.List,
  Tab: ChatTabItem,
  TabContent: ChatTabContent,
  MessageList: ChatMessageList,
  Messages: ChatMessages,
  Block: ChatBlock,
  Input: ChatInput,
};

export { Chat, useChat };
