"use client";

import { useParams, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarPanel,
  SidebarPanelGroup,
  SidebarHeader,
  SidebarBody,
  SidebarFooter,
  SidebarProject,
  SidebarSession,
  SidebarNewSession,
  SidebarAction,
} from "@/compositions/sidebar";
import { Avatar } from "@lab/ui/components/avatar";
import { Copy } from "@lab/ui/components/copy";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type Project = {
  id: string;
  name: string;
};

type Session = {
  id: string;
  projectId: string;
  title: string;
  hasUnread?: boolean;
  isWorking?: boolean;
  timestamp: string;
};

const projects: Project[] = [
  { id: "1", name: "acme/web-app" },
  { id: "2", name: "acme/api" },
  { id: "3", name: "acme/mobile" },
];

const sessions: Session[] = [
  { id: "s1", projectId: "1", title: "Fix auth redirect loop", isWorking: true, timestamp: "2m" },
  { id: "s2", projectId: "1", title: "Add dark mode support", timestamp: "1h" },
  { id: "s3", projectId: "1", title: "Refactor user settings", timestamp: "3h" },
  { id: "s4", projectId: "2", title: "Add rate limiting", isWorking: true, timestamp: "5m" },
  { id: "s5", projectId: "2", title: "Fix N+1 queries", hasUnread: true, timestamp: "1d" },
];

export default function DemoLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();

  const projectId = params.projectId
    ? typeof params.projectId === "string"
      ? params.projectId
      : params.projectId[0]
    : null;

  const sessionId = params.sessionId
    ? typeof params.sessionId === "string"
      ? params.sessionId
      : params.sessionId[0]
    : null;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex flex-1 min-h-0">
        <Sidebar>
          <SidebarPanel>
            <SidebarHeader>Projects</SidebarHeader>
            <SidebarBody>
              {projects.map((project) => (
                <SidebarProject
                  key={project.id}
                  name={project.name}
                  active={projectId === project.id}
                  onClick={() =>
                    router.push(projectId === project.id ? "/demo" : `/demo/${project.id}`)
                  }
                />
              ))}
            </SidebarBody>
            <SidebarFooter>
              <div className="flex items-center gap-1.5">
                <Avatar size="xs" fallback="JD" presence="online" />
                <Copy as="span" size="xs" className="truncate">
                  john@acme.com
                </Copy>
              </div>
            </SidebarFooter>
          </SidebarPanel>

          {projectId && (
            <SidebarPanelGroup>
              {projects
                .filter((project) => project.id === projectId)
                .map((project) => {
                  const projectSessions = sessions.filter((s) => s.projectId === project.id);
                  return (
                    <SidebarPanel key={project.id}>
                      <SidebarHeader
                        action={
                          <SidebarAction
                            icon={<X />}
                            label="Close"
                            onClick={() => router.push("/demo")}
                          />
                        }
                      >
                        {project.name}
                      </SidebarHeader>
                      <SidebarBody>
                        <SidebarNewSession />
                        {projectSessions.map((session) => (
                          <SidebarSession
                            key={session.id}
                            title={session.title}
                            hasUnread={session.hasUnread}
                            isWorking={session.isWorking}
                            active={sessionId === session.id}
                            onClick={() => router.push(`/demo/${project.id}/${session.id}`)}
                            timestamp={session.timestamp}
                          />
                        ))}
                      </SidebarBody>
                    </SidebarPanel>
                  );
                })}
            </SidebarPanelGroup>
          )}
        </Sidebar>

        <main className="flex-1 flex flex-col">{children}</main>
      </div>
      <footer className="h-8 border-t border-border" />
    </div>
  );
}
