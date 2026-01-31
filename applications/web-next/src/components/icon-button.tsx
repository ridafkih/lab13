import { type ComponentProps, forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const iconButton = tv({
  base: "shrink-0 cursor-pointer transition-colors -m-1.5 p-1.5",
  variants: {
    variant: {
      ghost: "text-text-muted hover:text-text",
    },
  },
  defaultVariants: {
    variant: "ghost",
  },
});

type IconButtonProps = ComponentProps<"button"> & VariantProps<typeof iconButton>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return <button ref={ref} className={iconButton({ variant, className })} {...props} />;
  },
);

IconButton.displayName = "IconButton";
