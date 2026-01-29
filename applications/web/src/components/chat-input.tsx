import type { ReactNode, TextareaHTMLAttributes } from "react";

interface ChatInputProps {
  children: ReactNode;
}

interface ChatInputTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

interface ChatInputActionsProps {
  children: ReactNode;
}

interface ChatInputActionsStartProps {
  children: ReactNode;
}

interface ChatInputActionsEndProps {
  children: ReactNode;
}

export function ChatInput({ children }: ChatInputProps) {
  return (
    <div className="border-t border-border">
      <label className="flex flex-col bg-background cursor-text">{children}</label>
    </div>
  );
}

export function ChatInputTextarea({ rows = 3, ...props }: ChatInputTextareaProps) {
  return (
    <textarea
      rows={rows}
      className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
      {...props}
    />
  );
}

export function ChatInputActions({ children }: ChatInputActionsProps) {
  return <div className="flex items-center justify-between px-1.5 pb-1.5">{children}</div>;
}

export function ChatInputActionsStart({ children }: ChatInputActionsStartProps) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export function ChatInputActionsEnd({ children }: ChatInputActionsEndProps) {
  return <div className="flex items-center gap-1">{children}</div>;
}
