import { tv, type VariantProps } from "tailwind-variants";

const avatar = tv({
  base: "shrink-0 rounded-full",
  variants: {
    size: {
      sm: "size-4",
      md: "size-6",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type AvatarProps = VariantProps<typeof avatar> & {
  src?: string;
  alt?: string;
  className?: string;
};

export function Avatar({ src, alt = "", size, className }: AvatarProps) {
  if (src) {
    return <img src={src} alt={alt} className={avatar({ size, className })} />;
  }

  return <div className={avatar({ size, className }) + " bg-bg-subtle"} />;
}
