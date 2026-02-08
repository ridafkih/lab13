"use client";

import type { ReactNode } from "react";
import { NavTabs, type TabItem } from "@/components/nav-tabs";

const settingsTabs: TabItem[] = [
  { label: "GitHub", href: "/settings/github" },
  { label: "Providers", href: "/settings/providers" },
  { label: "Projects", href: "/settings/projects", match: "/settings/projects" },
];

type SettingsShellProps = {
  children: ReactNode;
};

export function SettingsShell({ children }: SettingsShellProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <NavTabs.FromItems items={settingsTabs} />
      {children}
    </div>
  );
}
