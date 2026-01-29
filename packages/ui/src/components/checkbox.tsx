import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../utils/cn";
import { Copy } from "./copy";

type CheckboxSize = "sm" | "md";

const sizeStyles: Record<CheckboxSize, { box: string; icon: string; text: "xs" | "sm" }> = {
  sm: { box: "size-3", icon: "size-2", text: "xs" },
  md: { box: "size-4", icon: "size-3", text: "sm" },
};

export type CheckboxProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
  size?: CheckboxSize;
};

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked = false, onChange, children, className, size = "sm", ...props }, ref) => {
    const styles = sizeStyles[size];
    return (
      <label className={cn("flex items-center gap-1.5 cursor-pointer w-fit", className)}>
        <button
          ref={ref}
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onChange?.(!checked)}
          className={cn(
            "border flex items-center justify-center shrink-0",
            "focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
            styles.box,
            checked ? "border-foreground bg-foreground text-background" : "border-muted-foreground",
          )}
          {...props}
        >
          {checked && <Check className={styles.icon} />}
        </button>
        {children && <Copy size={styles.text}>{children}</Copy>}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
