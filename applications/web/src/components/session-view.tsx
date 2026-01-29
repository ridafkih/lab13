"use client";

import {
  type ReactNode,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  type KeyboardEvent,
} from "react";
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
import { MessageBlock } from "./message-block";
import { MessagePartsRenderer } from "./opencode/message-parts-renderer";
import { PermissionDialog } from "./opencode/permission-dialog";
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
};

export function SessionView({
  messages,
  reviewFiles,
  onDismissFile,
  frameUrl,
  onFrameRefresh,
  streamUrl,
  onStreamRefresh,
  onSendMessage,
  isSending = false,
  isProcessing = false,
  models = [],
  selectedModel,
  onModelChange,
  activePermission,
  onRespondToPermission,
}: SessionViewProps) {
  const [inputValue, setInputValue] = useState("");
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

  const isDisabled = isSending || isProcessing;

  return (
    <>
      {activePermission && onRespondToPermission && (
        <PermissionDialog permission={activePermission} onRespond={onRespondToPermission} />
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
              <MessagePartsRenderer key={messageState.info.id} messageState={messageState} />
            ))}
          </div>
          <ChatInput>
            <ChatInputTextarea
              placeholder="Send a message..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
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
        <TabsContent value="review" className="flex-1 flex flex-col min-h-0">
          <ReviewPanel files={reviewFiles} onDismiss={onDismissFile} />
        </TabsContent>
        <TabsContent value="frame" className="flex-1 flex flex-col min-h-0">
          {frameUrl && (
            <div className="p-2 border-b border-border">
              <UrlBar url={frameUrl} onRefresh={onFrameRefresh} />
            </div>
          )}
          <div className="flex-1 flex items-center justify-center">
            <Copy muted>Frame view coming soon</Copy>
          </div>
        </TabsContent>
        <TabsContent value="stream" className="flex-1 flex flex-col min-h-0">
          {streamUrl && (
            <div className="p-2 border-b border-border">
              <UrlBar url={streamUrl} onRefresh={onStreamRefresh} />
            </div>
          )}
          <div className="flex-1 flex items-center justify-center">
            <Copy muted>Stream view coming soon</Copy>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
