import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full bg-muted border border-border px-2 py-1.5 text-sm resize-none placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
