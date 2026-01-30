"use client";

import { useState, useCallback, useRef, useLayoutEffect, type KeyboardEvent } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Button } from "@lab/ui/components/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@lab/ui/components/tabs";
import {
  Send,
  Volume2,
  Plus,
  Zap,
  SlidersHorizontal,
  MessageSquare,
  FileSearch,
  Frame,
  Radio,
  Loader2,
} from "lucide-react";
import { ReviewPanel } from "./review-panel";
import type { ReviewableFile } from "@/types/review";
import { OpencodeParts } from "./opencode-parts";
import { OpencodePermissionDialog } from "./opencode-permission-dialog";
import { BrowserStream } from "./browser-stream";
import {
  ChatInput,
  ChatInputTextarea,
  ChatInputActions,
  ChatInputActionsStart,
  ChatInputActionsEnd,
} from "./chat-input";
import { UrlBar } from "./url-bar";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@lab/ui/components/dropdown";
import type {
  MessageState,
  PermissionRequest,
  PermissionResponse,
} from "@/lib/opencode/state/types";

type Model = {
  providerId: string;
  providerName: string;
  modelId: string;
  name: string;
};

type Link = {
  id: string;
  title: string;
  url: string;
};

type ContainerInfo = {
  id: string;
  name: string;
  status: string;
  urls: { port: number; url: string }[];
};

type BrowserStreamState = {
  desiredState: "running" | "stopped";
  currentState: "pending" | "starting" | "running" | "stopping" | "stopped" | "error";
  streamPort?: number;
  errorMessage?: string;
};

type SessionViewProps = {
  messages: MessageState[];
  reviewFiles: ReviewableFile[];
  onDismissFile: (path: string) => void;
  frameUrl?: string;
  onFrameRefresh?: () => void;
  streamUrl?: string;
  onStreamRefresh?: () => void;
  onSendMessage?: (content: string, model?: { providerId: string; modelId: string }) => void;
  isSending?: boolean;
  isProcessing?: boolean;
  models?: Model[];
  selectedModel?: Model | null;
  onModelChange?: (model: Model) => void;
  activePermission?: PermissionRequest | null;
  onRespondToPermission?: (permissionId: string, response: PermissionResponse) => void;
  links?: Link[];
  containers?: ContainerInfo[];
  labSessionId: string;
  browserStreamState?: BrowserStreamState;
};

const defaultBrowserStreamState: BrowserStreamState = {
  desiredState: "stopped",
  currentState: "stopped",
};

export function SessionView({
  messages,
  reviewFiles,
  onDismissFile,
  onSendMessage,
  isSending = false,
  isProcessing = false,
  models = [],
  selectedModel,
  onModelChange,
  activePermission,
  onRespondToPermission,
  links = [],
  containers = [],
  labSessionId,
  browserStreamState = defaultBrowserStreamState,
}: SessionViewProps) {
  const [inputValue, setInputValue] = useState("");
  const [activeFrameTab, setActiveFrameTab] = useState<string | undefined>(undefined);
  const [visitedFrameTabs, setVisitedFrameTabs] = useState<Set<string>>(new Set());
  const frameRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 50;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useLayoutEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending || !onSendMessage) return;
    const model = selectedModel
      ? { providerId: selectedModel.providerId, modelId: selectedModel.modelId }
      : undefined;
    onSendMessage(trimmed, model);
    setInputValue("");
    isAtBottomRef.current = true;
    scrollToBottom();
  }, [inputValue, isSending, onSendMessage, selectedModel, scrollToBottom]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFrameTabChange = useCallback((tabId: string) => {
    setActiveFrameTab(tabId);
    setVisitedFrameTabs((prev) => new Set([...prev, tabId]));
  }, []);

  const handleFrameRefresh = useCallback((linkId: string) => {
    frameRefs.current[linkId]?.contentWindow?.location.reload();
  }, []);

  const isDisabled = isSending || isProcessing;

  return (
    <>
      {activePermission && onRespondToPermission && (
        <OpencodePermissionDialog permission={activePermission} onRespond={onRespondToPermission} />
      )}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col h-full min-w-0">
        <TabsList className="grid-cols-[1fr_1fr_1fr_1fr]">
          <TabsTrigger value="chat">
            <MessageSquare className="size-3" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="review">
            <FileSearch className="size-3" />
            Review
          </TabsTrigger>
          <TabsTrigger value="frame">
            <Frame className="size-3" />
            Frame
          </TabsTrigger>
          <TabsTrigger value="stream">
            <Radio className="size-3" />
            Stream
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto chat-scroll-container -mb-px"
          >
            {messages.map((messageState) => (
              <OpencodeParts key={messageState.info.id} messageState={messageState} />
            ))}
          </div>
          <ChatInput>
            <ChatInputTextarea
              placeholder="Send a message..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
              autoFocus
            />
            <ChatInputActions>
              <ChatInputActionsStart>
                <Button variant="secondary" icon={<Plus className="size-3" />}>
                  Attach
                </Button>
                <Button variant="secondary" icon={<Zap className="size-3" />}>
                  Skills
                </Button>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button variant="secondary" icon={<SlidersHorizontal className="size-3" />}>
                      {selectedModel ? selectedModel.name : "Model"}
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu>
                    {models.map((model) => (
                      <DropdownItem
                        key={`${model.providerId}/${model.modelId}`}
                        onClick={() => onModelChange?.(model)}
                      >
                        {model.name}
                      </DropdownItem>
                    ))}
                    {models.length === 0 && (
                      <DropdownItem disabled>No models available</DropdownItem>
                    )}
                  </DropdownMenu>
                </Dropdown>
              </ChatInputActionsStart>
              <ChatInputActionsEnd>
                <Button variant="secondary" icon={<Volume2 className="size-3" />}>
                  Voice
                </Button>
                <Button
                  variant="primary"
                  icon={
                    isSending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Send className="size-3" />
                    )
                  }
                  onClick={handleSend}
                  disabled={isDisabled || !inputValue.trim()}
                >
                  Send
                </Button>
              </ChatInputActionsEnd>
            </ChatInputActions>
          </ChatInput>
        </TabsContent>
        <TabsContent value="review" className="flex-1 flex flex-col min-h-0 min-w-0">
          <ReviewPanel files={reviewFiles} onDismiss={onDismissFile} labSessionId={labSessionId} />
        </TabsContent>
        <TabsContent value="frame" className="flex-1 flex flex-col min-h-0">
          {(() => {
            const containerLinks = containers.flatMap((container) =>
              container.urls.map((urlInfo) => ({
                id: `${container.id}-${urlInfo.port}`,
                title: `${container.name}:${urlInfo.port}`,
                url: urlInfo.url,
              })),
            );
            const allLinks = [...containerLinks, ...links];

            if (allLinks.length === 0) {
              return (
                <div className="flex-1 flex items-center justify-center">
                  <Copy muted>No links available</Copy>
                </div>
              );
            }

            return (
              <Tabs
                value={activeFrameTab ?? allLinks[0]?.id}
                onValueChange={handleFrameTabChange}
                className="flex-1 flex flex-col min-h-0"
              >
                <TabsList style={{ gridTemplateColumns: `repeat(${allLinks.length}, 1fr)` }}>
                  {allLinks.map((link) => (
                    <TabsTrigger key={link.id} value={link.id}>
                      {link.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="flex-1 relative">
                  {allLinks.map((link) => (
                    <div
                      key={link.id}
                      className={cn(
                        "absolute inset-0 flex flex-col",
                        (activeFrameTab ?? allLinks[0]?.id) !== link.id && "hidden",
                      )}
                    >
                      {visitedFrameTabs.has(link.id) ||
                      (activeFrameTab === undefined && link.id === allLinks[0]?.id) ? (
                        <>
                          <div className="p-2 border-b border-border">
                            <UrlBar url={link.url} onRefresh={() => handleFrameRefresh(link.id)} />
                          </div>
                          <iframe
                            ref={(el) => {
                              frameRefs.current[link.id] = el;
                            }}
                            src={link.url}
                            className="flex-1 border-0"
                          />
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Tabs>
            );
          })()}
        </TabsContent>
        <TabsContent value="stream" className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex items-center justify-center p-4">
            <BrowserStream
              sessionId={labSessionId}
              className="w-full max-w-4xl"
              browserStreamState={browserStreamState}
            />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
