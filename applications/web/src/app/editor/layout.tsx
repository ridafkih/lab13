"use client";

import { useParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Nav } from "@/components/nav";
import { ProjectNavigatorView } from "@/components/project-navigator-view";
import { ProjectsLoadingFallback } from "@/components/suspense-fallbacks";
import { defaultSettingsTab } from "@/config/settings";
import { AcpSessionProvider } from "@/lib/acp-session";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];

function Sidebar({ selectedSessionId }: { selectedSessionId: string | null }) {
  return (
    <aside className="relative flex w-full min-w-0 grow flex-col border-border border-r bg-bg">
      <Suspense fallback={<ProjectsLoadingFallback />}>
        <ProjectNavigatorView selectedSessionId={selectedSessionId} />
      </Suspense>
    </aside>
  );
}

export default function EditorLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const sessionId =
    typeof params.sessionId === "string" ? params.sessionId : null;

  return (
    <AcpSessionProvider sessionId={sessionId}>
      <div className="flex h-screen max-w-full flex-col">
        <Nav items={navItems} />
        <div className="grid h-full min-h-0 max-w-full grid-cols-[2fr_5fr]">
          <Sidebar selectedSessionId={sessionId} />
          <main className="flex-1 overflow-x-hidden bg-bg">{children}</main>
        </div>
      </div>
    </AcpSessionProvider>
  );
}
