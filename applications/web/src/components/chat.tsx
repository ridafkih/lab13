"use client";

import {
  createContext,
  use,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type RefObject,
} from "react";
import { tv } from "tailwind-variants";
import { TextAreaGroup } from "./textarea-group";
import { Tabs } from "./tabs";
import { PageFrame, Header } from "./layout-primitives";
import { useAttachments, type Attachment } from "@/lib/use-attachments";

type ChatRole = "user" | "assistant";

type SubmitOptions = {
  content: string;
  modelId?: string;
  attachments?: Attachment[];
};

type ChatInputState = {
  attachments: Attachment[];
};

type ChatInputActions = {
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
};

type ChatInputContextValue = {
  state: ChatInputState;
  actions: ChatInputActions;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isDragging: boolean;
  dragHandlers: ReturnType<typeof useAttachments>["dragHandlers"];
};

type ChatContextValue = {
  getScrollRef: () => RefObject<HTMLDivElement | null>;
  getIsNearBottomRef: () => RefObject<boolean>;
  scrollToBottom: (force?: boolean) => void;
  getModelId: () => string | null;
  setModelId: (value: string) => void;
};

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

type ChatProviderProps = {
  children: ReactNode;
  defaultModelId?: string;
  onSubmit?: (options: SubmitOptions) => void;
  onAbort?: () => void;
};

function ChatProvider({ children, defaultModelId, onSubmit, onAbort }: ChatProviderProps) {
  const [modelId, setModelId] = useState(defaultModelId ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { attachments, addFiles, removeAttachment, clearAttachments, isDragging, dragHandlers } =
    useAttachments();

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
      (attachment) => attachment.status === "ready",
    );

    if (!hasContent && !hasAttachments) return;

    onSubmit?.({
      content: currentInput,
      modelId: currentModelId ?? undefined,
      attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
    });

    if (inputRef.current) inputRef.current.value = "";
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
        if (!force && !isNearBottomRef.current) return;
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      },
      getModelId: () => modelIdRef.current,
      setModelId: (value: string) => setModelId(value),
    };
  }

  const chatInputContextValue = useRef<ChatInputContextValue | null>(null);
  if (!chatInputContextValue.current) {
    chatInputContextValue.current = {
      state: { attachments: [] },
      actions: { addFiles, removeAttachment, onSubmit: handleSubmit, onAbort: handleAbort },
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
      <ChatInputContext value={chatInputContextValue.current}>{children}</ChatInputContext>
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
  return <div className="flex items-center gap-1 overflow-x-hidden">{children}</div>;
}

function ChatHeaderDivider() {
  return <span className="text-text-muted">/</span>;
}

function ChatHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-text font-medium text-nowrap overflow-x-hidden truncate">{children}</span>
  );
}

function ChatHeaderEmptyTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-text-muted italic text-nowrap overflow-x-hidden truncate">
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

function ChatTabItem({ value, children }: { value: ChatTab; children: ReactNode }) {
  return <Tabs.Tab value={value}>{children}</Tabs.Tab>;
}

function ChatTabContent({ value, children }: { value: ChatTab; children: ReactNode }) {
  return <Tabs.Content value={value}>{children}</Tabs.Content>;
}

const messageList = tv({
  base: "overflow-y-auto flex flex-col",
  variants: {
    compact: {
      false: "flex-1 justify-between",
    },
  },
  defaultVariants: {
    compact: false,
  },
});

function ChatMessageList({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const { getScrollRef, getIsNearBottomRef } = useChat();
  const scrollRef = getScrollRef();
  const isNearBottomRef = getIsNearBottomRef();

  const handleScroll = () => {
    const { current: element } = scrollRef;
    if (!element) return;
    const { scrollHeight, scrollTop, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD;
  };

  return (
    <div ref={scrollRef} onScroll={handleScroll} className={messageList({ compact })}>
      {children}
    </div>
  );
}

function ChatMessages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px bg-border not-empty:pb-px">{children}</div>;
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

function ChatBlock({ role, children }: { role: ChatRole; children: ReactNode }) {
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
    <div className="sticky bottom-0 p-4 bg-linear-to-t from-bg to-transparent pointer-events-none z-10">
      {statusMessage && (
        <div className="mb-2 px-3 py-1.5 bg-amber-950 text-amber-500 border border-amber-900 text-xs pointer-events-auto">
          {statusMessage}
        </div>
      )}
      <TextAreaGroup.Provider
        state={{ attachments: state.attachments }}
        actions={{
          onSubmit: actions.onSubmit,
          onAbort: actions.onAbort,
          onAddFiles: actions.addFiles,
          onRemoveAttachment: actions.removeAttachment,
        }}
        meta={{ textareaRef: inputRef, isSending, isDragging, dragHandlers }}
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
