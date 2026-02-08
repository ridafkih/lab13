import type { ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const pageFrame = tv({
  base: "flex flex-col h-full min-w-0",
  variants: {
    overflow: {
      hidden: "overflow-hidden",
      auto: "overflow-auto",
    },
    position: {
      relative: "relative",
    },
  },
});

type PageFrameProps = {
  children: ReactNode;
  className?: string;
} & VariantProps<typeof pageFrame>;

function PageFrame({ children, overflow, position, className }: PageFrameProps) {
  return <div className={pageFrame({ overflow, position, className })}>{children}</div>;
}

const header = tv({
  base: "flex items-center gap-2 px-3 py-1.5 border-b border-border",
  variants: {
    spacing: {
      default: "gap-2",
      wide: "gap-4",
    },
  },
  defaultVariants: {
    spacing: "default",
  },
});

type HeaderProps = {
  children: ReactNode;
  className?: string;
  as?: "header" | "nav" | "div";
} & VariantProps<typeof header>;

function Header({ children, spacing, className, as: Component = "div" }: HeaderProps) {
  return <Component className={header({ spacing, className })}>{children}</Component>;
}

const pageContent = tv({
  base: "flex-1 min-h-0",
  variants: {
    overflow: {
      auto: "overflow-auto",
      hidden: "overflow-hidden",
    },
    display: {
      flex: "flex flex-col",
    },
  },
});

type PageContentProps = {
  children: ReactNode;
  className?: string;
} & VariantProps<typeof pageContent>;

function PageContent({ children, overflow, display, className }: PageContentProps) {
  return <div className={pageContent({ overflow, display, className })}>{children}</div>;
}

export { PageFrame, Header, PageContent };
