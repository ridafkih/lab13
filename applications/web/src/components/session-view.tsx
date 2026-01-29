"use client";

import { type ReactNode, useState, useCallback, type KeyboardEvent } from "react";
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
import {
  ToolCallBlock,
  ToolCallBlockStatus,
  ToolCallBlockDuration,
  ToolCallBlockName,
} from "./tool-call-block";
import {
  ChatInput,
  ChatInputTextarea,
  ChatInputActions,
  ChatInputActionsStart,
  ChatInputActionsEnd,
} from "./chat-input";
import { UrlBar } from "./url-bar";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@lab/ui/components/dropdown";

type Model = {
  providerId: string;
  providerName: string;
  modelId: string;
  name: string;
};

type ToolCallStatus = "in_progress" | "completed";

type ToolCall = {
  id: string;
  name: string;
  status: ToolCallStatus;
  duration?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
};

type SessionViewProps = {
  messages: Message[];
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
}: SessionViewProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending || !onSendMessage) return;
    const model = selectedModel
      ? { providerId: selectedModel.providerId, modelId: selectedModel.modelId }
      : undefined;
    onSendMessage(trimmed, model);
    setInputValue("");
  }, [inputValue, isSending, onSendMessage, selectedModel]);

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
        <div className="flex-1 overflow-y-auto">
          {messages.flatMap((message) => {
            const items: ReactNode[] = [
              <MessageBlock key={message.id} variant={message.role}>
                {message.content}
              </MessageBlock>,
            ];
            if (message.toolCalls) {
              for (const toolCall of message.toolCalls) {
                items.push(
                  <ToolCallBlock key={toolCall.id}>
                    <ToolCallBlockStatus completed={toolCall.status === "completed"} />
                    {toolCall.duration && (
                      <ToolCallBlockDuration>{toolCall.duration}</ToolCallBlockDuration>
                    )}
                    <ToolCallBlockName>{toolCall.name}</ToolCallBlockName>
                  </ToolCallBlock>,
                );
              }
            }
            return items;
          })}
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
                  {models.length === 0 && <DropdownItem disabled>No models available</DropdownItem>}
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
  );
}
