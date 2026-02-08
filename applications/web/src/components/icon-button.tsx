import type { ComponentProps, Ref } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const iconButton = tv({
  base: "shrink-0 cursor-pointer -m-1.5 p-1.5",
  variants: {
    variant: {
      ghost: "text-text-muted hover:text-text",
    },
  },
  defaultVariants: {
    variant: "ghost",
  },
});

type IconButtonProps = ComponentProps<"button"> &
  VariantProps<typeof iconButton> & {
    ref?: Ref<HTMLButtonElement>;
  };

export function IconButton({ className, variant, ref, ...props }: IconButtonProps) {
  return <button ref={ref} className={iconButton({ variant, className })} {...props} />;
}
