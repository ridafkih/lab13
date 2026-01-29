import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

interface InputGroupProps {
  children: ReactNode;
  className?: string;
}

export function InputGroup({ children, className }: InputGroupProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 bg-muted border border-border px-2 py-1.5",
        "focus-within:outline focus-within:outline-1 focus-within:outline-offset-px focus-within:outline-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface InputGroupIconProps {
  children: ReactNode;
  className?: string;
}

export function InputGroupIcon({ children, className }: InputGroupIconProps) {
  return (
    <span className={cn("size-3 text-muted-foreground [&>svg]:size-3", className)}>{children}</span>
  );
}

export type InputGroupInputProps = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export const InputGroupInput = forwardRef<HTMLInputElement, InputGroupInputProps>(
  ({ className, mono, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
          mono && "font-mono",
          className,
        )}
        {...props}
      />
    );
  },
);

InputGroupInput.displayName = "InputGroupInput";
