import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Slot } from "../utils/slot";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "primary-accent" | "secondary" | "outline";
type ButtonSize = "sm" | "md";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  "primary-accent": "bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "bg-muted text-muted-foreground hover:bg-muted/70",
  outline: "bg-muted border border-border text-foreground hover:bg-muted/70",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2 py-1.5 text-xs gap-1",
  md: "px-3 py-2 text-sm gap-1.5",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "sm",
      loading = false,
      disabled,
      asChild = false,
      icon,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(
          "flex items-center justify-center",
          sizeStyles[size],
          variantStyles[variant],
          "focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {!loading && icon}
        {children}
      </Comp>
    );
  },
);

Button.displayName = "Button";
