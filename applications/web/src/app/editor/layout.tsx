"use client";

import { Suspense, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { ProjectNavigatorView } from "@/components/project-navigator-view";
import { ProjectsLoadingFallback } from "@/components/suspense-fallbacks";
import { OpenCodeSessionProvider } from "@/lib/opencode-session";
import { defaultSettingsTab } from "@/config/settings";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];

function Sidebar({ selectedSessionId }: { selectedSessionId: string | null }) {
  return (
    <aside className="relative flex grow flex-col min-w-0 w-full border-r border-border bg-bg">
      <Suspense fallback={<ProjectsLoadingFallback />}>
        <ProjectNavigatorView selectedSessionId={selectedSessionId} />
      </Suspense>
    </aside>
  );
}

export default function EditorLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  return (
    <OpenCodeSessionProvider sessionId={sessionId}>
      <div className="flex flex-col h-screen max-w-full">
        <Nav items={navItems} />
        <div className="grid grid-cols-[2fr_5fr] h-full min-h-0 max-w-full">
          <Sidebar selectedSessionId={sessionId} />
          <main className="flex-1 bg-bg overflow-x-hidden">{children}</main>
        </div>
      </div>
    </OpenCodeSessionProvider>
  );
}
