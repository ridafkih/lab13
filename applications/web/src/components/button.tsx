import { type ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: "flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
  variants: {
    variant: {
      primary: "border border-border text-text bg-bg-muted hover:bg-bg-hover",
      ghost: "text-text-muted hover:text-text hover:bg-bg-muted",
      danger: "border border-red-500/30 text-red-500 hover:bg-red-500/10",
      active: "border border-blue-500/50 text-blue-500 bg-blue-500/10",
    },
    size: {
      sm: "px-1.5 py-0.5",
      md: "px-2 py-1",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button>;

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={button({ variant, size, className })} {...props} />;
}

export { Button, button };
