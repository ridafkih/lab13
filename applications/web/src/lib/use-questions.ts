"use client";

import { useState } from "react";
import { useSessionClient } from "./use-session-client";

interface UseQuestionsResult {
  isSubmitting: boolean;
  reply: (callId: string, answers: string[][]) => Promise<void>;
  reject: (callId: string) => Promise<void>;
}

export function useQuestions(labSessionId: string): UseQuestionsResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const opencodeClient = useSessionClient(labSessionId);

  const reply = async (requestId: string, answers: string[][]) => {
    if (!opencodeClient) {
      throw new Error("Client not initialized");
    }

    setIsSubmitting(true);

    try {
      const response = await opencodeClient.question.reply({
        requestID: requestId,
        answers,
      });
      if (response.error) {
        throw new Error(`Failed to reply to question: ${JSON.stringify(response.error)}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const reject = async (requestId: string) => {
    if (!opencodeClient) {
      throw new Error("Client not initialized");
    }

    setIsSubmitting(true);

    try {
      const response = await opencodeClient.question.reject({
        requestID: requestId,
      });
      if (response.error) {
        throw new Error(`Failed to reject question: ${JSON.stringify(response.error)}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    reply,
    reject,
  };
}
