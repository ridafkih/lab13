"use client";

import { useEffect, useRef, useState } from "react";
import { useSessionContext } from "@/app/editor/[sessionId]/layout";
import { Chat, useChat } from "@/components/chat";
import { MessagePart } from "@/components/message-part";
import { TextAreaGroup } from "@/components/textarea-group";
import { isToolCallPart } from "@/lib/acp-types";
import { useModelSelection } from "@/lib/hooks";
import { QuestionProvider } from "@/lib/question-context";
import type { MessageState, SessionStatus } from "@/lib/use-agent";
import { useSessionStatus } from "@/lib/use-session-status";

function formatErrorMessage(status: SessionStatus): string | null {
  if (status.type !== "error" || !status.message) {
    return null;
  }

  if (status.message.includes("credit balance")) {
    return "Insufficient credits. Please add credits to continue.";
  }
  if (status.statusCode === 429) {
    return "Rate limited. Please wait or try a different model.";
  }

  return status.message;
}

interface ChatTabContentProps {
  messages: MessageState[];
  onQuestionReply: (callId: string, answers: string[][]) => Promise<void>;
  onQuestionReject: (callId: string) => Promise<void>;
  isQuestionSubmitting: boolean;
  sessionStatus: SessionStatus;
  onAbort: () => void;
  questionRequests: Map<string, string>;
}

export function ChatTabContent({
  messages,
  onQuestionReply,
  onQuestionReject,
  isQuestionSubmitting,
  sessionStatus,
  onAbort,
  questionRequests,
}: ChatTabContentProps) {
  const { session } = useSessionContext();
  const status = useSessionStatus(session);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const { getModelId, setModelId: setChatModelId } = useChat();
  const { models, modelId, setModelId } = useModelSelection({
    syncTo: setChatModelId,
    currentSyncedValue: getModelId(),
  });
  const firstModel = models?.[0];
  const isStreamingRef = useRef(false);

  const lastMessage = messages.at(-1);
  const isStreaming = lastMessage?.role === "assistant";

  const hasRunningTool =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => isToolCallPart(part) && part.status === "in_progress"
    );

  const isActive =
    status === "generating" || sessionStatus.type === "busy" || hasRunningTool;

  useEffect(() => {
    if (isStreaming) {
      isStreamingRef.current = true;
    } else if (isStreamingRef.current) {
      isStreamingRef.current = false;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (sessionStatus.type === "retry") {
      onAbort();
      setRateLimitMessage("Rate limited. Try a different model.");
    } else if (sessionStatus.type === "error" && sessionStatus.message) {
      setRateLimitMessage(formatErrorMessage(sessionStatus));
    }
  }, [sessionStatus, onAbort]);

  useEffect(() => {
    setRateLimitMessage(null);
  }, []);

  return (
    <QuestionProvider
      isSubmitting={isQuestionSubmitting}
      onReject={onQuestionReject}
      onReply={onQuestionReply}
      questionRequests={questionRequests}
    >
      <Chat.MessageList>
        <Chat.Messages>
          {messages.flatMap((message) =>
            message.parts.map((part, partIndex) => (
              <Chat.Block
                key={`${message.id}-${partIndex}`}
                role={message.role}
              >
                <MessagePart.Root
                  allParts={message.parts}
                  isStreaming={
                    message.role === "assistant" && message === messages.at(-1)
                  }
                  part={part}
                />
              </Chat.Block>
            ))
          )}
        </Chat.Messages>
        <Chat.Input isSending={isActive} statusMessage={rateLimitMessage}>
          {firstModel && (
            <TextAreaGroup.ModelSelector
              models={models ?? []}
              onChange={setModelId}
              value={modelId ?? firstModel.value}
            />
          )}
        </Chat.Input>
      </Chat.MessageList>
    </QuestionProvider>
  );
}
