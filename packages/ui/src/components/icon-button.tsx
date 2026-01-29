import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "p-1 text-muted-foreground hover:text-foreground hover:bg-muted",
          "focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
          className,
        )}
        {...props}
      >
        <span className="size-3 [&>svg]:size-3">{icon}</span>
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
