"use client";

import { useState, createContext, use, type ReactNode } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { useQuestionActions } from "@/lib/question-context";
import { getArray, getString } from "../shared";
import type { ToolRendererProps } from "../types";

interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

interface QuestionStateContextValue {
  state: {
    selectedByQuestion: Map<number, Set<string>>;
    customByQuestion: Map<number, string>;
  };
  actions: {
    toggleOption: (questionIndex: number, label: string, allowMultiple: boolean) => void;
    setCustomValue: (questionIndex: number, value: string) => void;
  };
}

const QuestionStateContext = createContext<QuestionStateContextValue | null>(null);

function useQuestionState() {
  const context = use(QuestionStateContext);
  if (!context) {
    throw new Error("Question components must be used within QuestionStateProvider");
  }
  return context;
}

const card = tv({
  base: "flex flex-col gap-3 p-3 bg-bg-muted border border-border",
});

const header = tv({
  base: "px-1.5 py-0.5 text-[10px] bg-bg border border-border text-text-muted",
});

const questionText = tv({
  base: "text-xs text-text",
});

const option = tv({
  base: "flex items-start gap-2 p-2 text-left border",
  variants: {
    selected: {
      true: "border-text-muted bg-bg-muted",
      false: "border-border bg-bg hover:border-text-muted",
    },
  },
  defaultVariants: {
    selected: false,
  },
});

const checkboxStyle = tv({
  base: "w-3 h-3 mt-0.5 shrink-0 border flex items-center justify-center",
  variants: {
    selected: {
      true: "border-text bg-text",
      false: "border-text-muted",
    },
    multiple: {
      true: "",
      false: "rounded-full",
    },
  },
  defaultVariants: {
    selected: false,
    multiple: false,
  },
});

const optionLabel = tv({
  base: "text-xs text-text",
});

const optionDescription = tv({
  base: "text-[10px] text-text-muted",
});

const customInput = tv({
  base: "w-full px-2 py-1.5 text-xs bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-text-muted",
});

const button = tv({
  base: "flex items-center gap-1 px-2 py-1 text-xs border",
  variants: {
    variant: {
      primary: "",
      secondary: "border-border bg-bg",
    },
    disabled: {
      true: "cursor-not-allowed",
      false: "",
    },
  },
  compoundVariants: [
    {
      variant: "primary",
      disabled: false,
      className: "border-text-muted bg-bg hover:bg-bg-muted text-text",
    },
    {
      variant: "primary",
      disabled: true,
      className: "border-border bg-bg text-text-muted",
    },
    {
      variant: "secondary",
      disabled: false,
      className: "text-text-muted hover:text-text hover:border-text-muted",
    },
    {
      variant: "secondary",
      disabled: true,
      className: "text-text-muted",
    },
  ],
  defaultVariants: {
    variant: "primary",
    disabled: false,
  },
});

function QuestionStateProvider({ children }: { children: ReactNode }) {
  const [selectedByQuestion, setSelectedByQuestion] = useState<Map<number, Set<string>>>(
    () => new Map(),
  );
  const [customByQuestion, setCustomByQuestion] = useState<Map<number, string>>(() => new Map());

  const toggleOption = (questionIndex: number, label: string, allowMultiple: boolean) => {
    setSelectedByQuestion((previous) => {
      const updated = new Map(previous);
      const currentSelected = updated.get(questionIndex) ?? new Set<string>();
      const newSelected = new Set(currentSelected);

      if (newSelected.has(label)) {
        newSelected.delete(label);
      } else {
        if (!allowMultiple) {
          newSelected.clear();
        }
        newSelected.add(label);
      }

      updated.set(questionIndex, newSelected);
      return updated;
    });

    if (!allowMultiple) {
      setCustomByQuestion((previous) => {
        const updated = new Map(previous);
        updated.delete(questionIndex);
        return updated;
      });
    }
  };

  const setCustomValue = (questionIndex: number, value: string) => {
    setCustomByQuestion((previous) => {
      const updated = new Map(previous);
      if (value) {
        updated.set(questionIndex, value);
      } else {
        updated.delete(questionIndex);
      }
      return updated;
    });
  };

  return (
    <QuestionStateContext
      value={{
        state: { selectedByQuestion, customByQuestion },
        actions: { toggleOption, setCustomValue },
      }}
    >
      {children}
    </QuestionStateContext>
  );
}

interface SingleQuestionProps {
  question: QuestionInfo;
  questionIndex: number;
}

function SingleQuestion({ question, questionIndex }: SingleQuestionProps) {
  const { state, actions } = useQuestionState();

  const selectedOptions = state.selectedByQuestion.get(questionIndex) ?? new Set<string>();
  const customValue = state.customByQuestion.get(questionIndex) ?? "";
  const allowMultiple = question.multiple ?? false;
  const allowCustom = question.custom !== false;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={header()}>{question.header}</span>
        <span className={questionText()}>{question.question}</span>
      </div>

      <div className="flex flex-col gap-1">
        {question.options.map((questionOption) => {
          const isSelected = selectedOptions.has(questionOption.label);
          return (
            <button
              key={questionOption.label}
              type="button"
              onClick={() =>
                actions.toggleOption(questionIndex, questionOption.label, allowMultiple)
              }
              className={option({ selected: isSelected })}
            >
              <div className={checkboxStyle({ selected: isSelected, multiple: allowMultiple })}>
                {isSelected && <Check size={8} className="text-bg" />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className={optionLabel()}>{questionOption.label}</span>
                <span className={optionDescription()}>{questionOption.description}</span>
              </div>
            </button>
          );
        })}

        {allowCustom && (
          <input
            type="text"
            value={customValue}
            onChange={(event) => actions.setCustomValue(questionIndex, event.target.value)}
            placeholder="Other (type your answer)..."
            className={customInput()}
          />
        )}
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  callId?: string;
  questions: QuestionInfo[];
  isSubmitting: boolean;
  onReply: (callId: string, answers: string[][]) => Promise<void>;
  onReject: (callId: string) => Promise<void>;
}

function ActionButtons({ callId, questions, isSubmitting, onReply, onReject }: ActionButtonsProps) {
  const { state } = useQuestionState();

  const hasAnySelection = questions.some((_, questionIndex) => {
    const selected = state.selectedByQuestion.get(questionIndex);
    const custom = state.customByQuestion.get(questionIndex);
    return (selected && selected.size > 0) || (custom && custom.length > 0);
  });

  const handleReply = async () => {
    if (!callId) return;
    const answers: string[][] = questions.map((_, questionIndex) => {
      const selected = state.selectedByQuestion.get(questionIndex) ?? new Set<string>();
      const custom = state.customByQuestion.get(questionIndex);
      const result = [...selected];
      if (custom) {
        result.push(custom);
      }
      return result;
    });

    await onReply(callId, answers);
  };

  const handleReject = async () => {
    if (!callId) return;
    await onReject(callId);
  };

  const isReplyDisabled = isSubmitting || !hasAnySelection || !callId;

  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        type="button"
        onClick={handleReply}
        disabled={isReplyDisabled}
        className={button({ variant: "primary", disabled: isReplyDisabled })}
      >
        <Check size={12} />
        Reply
      </button>
      <button
        type="button"
        onClick={handleReject}
        disabled={isSubmitting}
        className={button({ variant: "secondary", disabled: isSubmitting })}
      >
        <X size={12} />
        Dismiss
      </button>
    </div>
  );
}

function QuestionRenderer({ callId, input, status, output, error }: ToolRendererProps) {
  const questionActions = useQuestionActions();
  const questions = getArray<QuestionInfo>(input, "questions") ?? [];

  const requestId =
    (callId && questionActions?.questionRequests.get(callId)) ??
    getString(input, "requestId") ??
    getString(input, "requestID") ??
    callId;

  if (status === "completed") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-text-muted">
        <Check size={12} className="text-green-500" />
        <span>Question answered</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="px-4 py-2 text-xs text-red-500">{error ?? "Failed to process question"}</div>
    );
  }

  if (questions.length === 0) {
    return <div className="px-4 py-2 text-xs text-text-muted">No questions to display</div>;
  }

  if (!questionActions) {
    return (
      <div className="px-4 py-2 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin inline mr-2" />
        Loading question...
      </div>
    );
  }

  return (
    <QuestionStateProvider>
      <div className={card()}>
        {questions.map((question, questionIndex) => (
          <SingleQuestion
            key={`${question.header}-${question.question}-${questionIndex}`}
            question={question}
            questionIndex={questionIndex}
          />
        ))}
        <ActionButtons
          callId={requestId}
          questions={questions}
          isSubmitting={questionActions.isSubmitting}
          onReply={questionActions.reply}
          onReject={questionActions.reject}
        />
      </div>
    </QuestionStateProvider>
  );
}

export { QuestionRenderer };
