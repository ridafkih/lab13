"use client";

import { type ReactNode } from "react";
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
};

export function SessionView({
  messages,
  reviewFiles,
  onDismissFile,
  frameUrl,
  onFrameRefresh,
  streamUrl,
  onStreamRefresh,
}: SessionViewProps) {
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
          <ChatInputTextarea placeholder="Send a message..." />
          <ChatInputActions>
            <ChatInputActionsStart>
              <Button variant="secondary" icon={<Plus className="size-3" />}>
                Attach
              </Button>
              <Button variant="secondary" icon={<Zap className="size-3" />}>
                Skills
              </Button>
              <Button variant="secondary" icon={<SlidersHorizontal className="size-3" />}>
                Model
              </Button>
            </ChatInputActionsStart>
            <ChatInputActionsEnd>
              <Button variant="secondary" icon={<Volume2 className="size-3" />}>
                Voice
              </Button>
              <Button variant="primary" icon={<Send className="size-3" />}>
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
