"use client";

import { useEffect, useRef } from "react";
import { Chat, useChat } from "@/components/chat";
import { TextAreaGroup } from "@/components/textarea-group";
import { MessagePart } from "@/components/message-part";
import { useModels, usePreferredModel } from "@/lib/hooks";
import type { MessageState } from "@/lib/use-agent";

type ChatTabContentProps = {
  messages: MessageState[];
};

export function ChatTabContent({ messages }: ChatTabContentProps) {
  const { data: modelGroups } = useModels();
  const { state, actions } = useChat();
  const [preferredModel, setPreferredModel] = usePreferredModel();
  const isStreamingRef = useRef(false);

  useEffect(() => {
    if (modelGroups && !state.modelId) {
      const validModel = modelGroups
        .flatMap(({ models }) => models)
        .find(({ value }) => value === preferredModel);
      const fallback = modelGroups[0]?.models[0];
      const modelToSet = validModel?.value ?? fallback?.value;
      if (modelToSet) actions.setModelId(modelToSet);
    }
  }, [modelGroups, state.modelId, preferredModel, actions]);

  const handleModelChange = (value: string) => {
    actions.setModelId(value);
    setPreferredModel(value);
  };

  const lastMessage = messages[messages.length - 1];
  const isStreaming = lastMessage?.role === "assistant";

  useEffect(() => {
    if (isStreaming) {
      isStreamingRef.current = true;
      actions.scrollToBottom();
    } else if (isStreamingRef.current) {
      isStreamingRef.current = false;
    }
  }, [isStreaming, lastMessage?.parts.length, actions]);

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
            onChange={handleModelChange}
          />
        )}
      </Chat.Input>
    </Chat.MessageList>
  );
}
