import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

const breadcrumbItem = tv({
  base: "text-nowrap overflow-x-hidden truncate",
  variants: {
    muted: {
      true: "text-text-muted italic",
      false: "text-text font-medium",
    },
  },
  defaultVariants: {
    muted: false,
  },
});

function BreadcrumbRoot({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 overflow-x-hidden">{children}</div>;
}

function BreadcrumbItem({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <span className={breadcrumbItem({ muted })}>{children}</span>;
}

function BreadcrumbMutedItem({ children }: { children: ReactNode }) {
  return (
    <span className="text-text-muted text-nowrap overflow-x-hidden shrink-0 truncate">
      {children}
    </span>
  );
}

function BreadcrumbSeparator() {
  return <span className="text-text-muted">/</span>;
}

const Breadcrumb = {
  Root: BreadcrumbRoot,
  Item: BreadcrumbItem,
  MutedItem: BreadcrumbMutedItem,
  Separator: BreadcrumbSeparator,
};

export { Breadcrumb };
