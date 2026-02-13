"use client";

import { useState } from "react";
import { getAgentApiUrl } from "./acp-session";

interface UseQuestionsResult {
  isSubmitting: boolean;
  reply: (callId: string, answers: string[][]) => Promise<void>;
  reject: (callId: string) => Promise<void>;
}

export function useQuestions(labSessionId: string): UseQuestionsResult {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reply = async (requestId: string, answers: string[][]) => {
    setIsSubmitting(true);

    try {
      const apiUrl = getAgentApiUrl();
      const response = await fetch(
        `${apiUrl}/acp/questions/${encodeURIComponent(requestId)}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Lab-Session-Id": labSessionId,
          },
          body: JSON.stringify({ answers }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to reply to question: ${response.status}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const reject = async (requestId: string) => {
    setIsSubmitting(true);

    try {
      const apiUrl = getAgentApiUrl();
      const response = await fetch(
        `${apiUrl}/acp/questions/${encodeURIComponent(requestId)}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Lab-Session-Id": labSessionId,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to reject question: ${response.status}`);
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
