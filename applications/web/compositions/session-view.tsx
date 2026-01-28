"use client";

import { type ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Button } from "@lab/ui/components/button";
import { Spinner } from "@lab/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@lab/ui/components/tabs";
import {
  ChevronDown,
  Send,
  Volume2,
  Plus,
  Zap,
  SlidersHorizontal,
  Check,
  MessageSquare,
  FileSearch,
  Frame,
  Radio,
} from "lucide-react";
import { ReviewPanel } from "./review/review-panel";
import type { ReviewableFile } from "@/types/review";

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
};

export function SessionView({ messages, reviewFiles, onDismissFile }: SessionViewProps) {
  return (
    <Tabs defaultValue="chat" className="flex-1 flex flex-col h-full min-w-0">
      <TabsList className="grid-cols-[1fr_1fr_1fr_1fr]">
        <TabsTrigger value="chat">
          <MessageSquare className="w-3 h-3" />
          Chat
        </TabsTrigger>
        <TabsTrigger value="review">
          <FileSearch className="w-3 h-3" />
          Review
        </TabsTrigger>
        <TabsTrigger value="frame">
          <Frame className="w-3 h-3" />
          Frame
        </TabsTrigger>
        <TabsTrigger value="stream">
          <Radio className="w-3 h-3" />
          Stream
        </TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">
          {messages.flatMap((message) => {
            const items: ReactNode[] = [<MessageBlock key={message.id} message={message} />];
            if (message.toolCalls) {
              for (const toolCall of message.toolCalls) {
                items.push(<ToolCallBlock key={toolCall.id} toolCall={toolCall} />);
              }
            }
            return items;
          })}
        </div>
        <ChatInput />
      </TabsContent>
      <TabsContent value="review" className="flex-1 flex flex-col min-h-0">
        <ReviewPanel files={reviewFiles} onDismiss={onDismissFile} />
      </TabsContent>
      <TabsContent value="frame" className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <Copy muted>Frame view coming soon</Copy>
        </div>
      </TabsContent>
      <TabsContent value="stream" className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <Copy muted>Stream view coming soon</Copy>
        </div>
      </TabsContent>
    </Tabs>
  );
}

type MessageBlockProps = {
  message: Message;
};

function MessageBlock({ message }: MessageBlockProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={cn("border-b border-border px-4 py-3", isAssistant && "bg-muted")}>
      <Copy size="sm">{message.content}</Copy>
    </div>
  );
}

type ToolCallBlockProps = {
  toolCall: ToolCall;
};

function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const isCompleted = toolCall.status === "completed";

  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full px-4 py-2 text-muted-foreground border-b border-border bg-muted/30 hover:bg-muted/50"
    >
      {isCompleted ? <Check className="w-3 h-3" /> : <Spinner size="xxs" />}
      {toolCall.duration && (
        <Copy as="span" size="xs" muted>
          {toolCall.duration}
        </Copy>
      )}
      <Copy as="span" size="xs">
        {toolCall.name}
      </Copy>
      <span className="flex-1" />
      <ChevronDown className="w-3 h-3" />
    </button>
  );
}

function ChatInput() {
  return (
    <div className="border-t border-border">
      <label className="flex flex-col bg-background cursor-text">
        <textarea
          placeholder="Send a message..."
          rows={3}
          className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <div className="flex items-center gap-1">
            <Button variant="secondary" icon={<Plus className="w-3 h-3" />}>
              Attach
            </Button>
            <Button variant="secondary" icon={<Zap className="w-3 h-3" />}>
              Skills
            </Button>
            <Button variant="secondary" icon={<SlidersHorizontal className="w-3 h-3" />}>
              Model
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="secondary" icon={<Volume2 className="w-3 h-3" />}>
              Voice
            </Button>
            <Button variant="primary" icon={<Send className="w-3 h-3" />}>
              Send
            </Button>
          </div>
        </div>
      </label>
    </div>
  );
}
