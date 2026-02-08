"use client";

import type { ReactNode } from "react";
import { ProjectsList } from "@/components/settings/projects-list";

type ProjectsLayoutProps = {
  children: ReactNode;
};

export default function ProjectsLayout({ children }: ProjectsLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 min-w-60 border-r border-border overflow-y-auto">
        <ProjectsList.View />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
