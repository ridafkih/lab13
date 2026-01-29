import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Copy } from "@lab/ui/components/copy";
import { X } from "lucide-react";

interface SelectionFeedbackFormProps {
  children: ReactNode;
}

interface SelectionFeedbackFormHeaderProps {
  children: ReactNode;
  onClose: () => void;
}

interface SelectionFeedbackFormLocationProps {
  filePath: string;
  startLine: number;
  endLine?: number;
}

interface SelectionFeedbackFormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

interface SelectionFeedbackFormActionsProps {
  children: ReactNode;
}

export function SelectionFeedbackForm({ children }: SelectionFeedbackFormProps) {
  return <div className="border-t border-border">{children}</div>;
}

export function SelectionFeedbackFormHeader({
  children,
  onClose,
}: SelectionFeedbackFormHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border bg-muted/50">
      {children}
      <span className="flex-1" />
      <button type="button" onClick={onClose} className="p-0.5 hover:bg-muted">
        <X className="size-3 text-muted-foreground" />
      </button>
    </div>
  );
}

export function SelectionFeedbackFormLocation({
  filePath,
  startLine,
  endLine,
}: SelectionFeedbackFormLocationProps) {
  return (
    <Copy size="xs" muted>
      {filePath} L{startLine}
      {endLine !== undefined && endLine !== startLine && `-${endLine}`}
    </Copy>
  );
}

export const SelectionFeedbackFormTextarea = forwardRef<
  HTMLTextAreaElement,
  SelectionFeedbackFormTextareaProps
>(function SelectionFeedbackFormTextarea({ rows = 2, ...props }, ref) {
  return (
    <label className="flex flex-col bg-background cursor-text">
      <textarea
        ref={ref}
        rows={rows}
        className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
        {...props}
      />
    </label>
  );
});

export function SelectionFeedbackFormActions({ children }: SelectionFeedbackFormActionsProps) {
  return <div className="flex items-center justify-end px-1.5 pb-1.5">{children}</div>;
}
