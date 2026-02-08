"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tv } from "tailwind-variants";

const tabStyles = tv({
  base: "px-3 py-1 text-xs border-b-2 -mb-px",
  variants: {
    active: {
      true: "border-text text-text",
      false: "border-transparent text-text-muted hover:text-text",
    },
  },
});

type TabItem = {
  label: string;
  href: string;
  match?: string;
};

function NavTabsList({ children }: { children: ReactNode }) {
  return <div className="flex border-b border-border">{children}</div>;
}

function NavTabsTab({
  href,
  match,
  children,
}: {
  href: string;
  match?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = match ? pathname.startsWith(match) : pathname === href;

  return (
    <Link draggable={false} href={href} className={tabStyles({ active: isActive })}>
      {children}
    </Link>
  );
}

function NavTabsFromItems({ items }: { items: TabItem[] }) {
  return (
    <NavTabsList>
      {items.map(({ href, label, match }) => (
        <NavTabsTab key={href} href={href} match={match}>
          {label}
        </NavTabsTab>
      ))}
    </NavTabsList>
  );
}

const NavTabs = {
  List: NavTabsList,
  Tab: NavTabsTab,
  FromItems: NavTabsFromItems,
};

export { NavTabs };
export type { TabItem };
