"use client";

import { Loader2 } from "lucide-react";
import { ProjectNavigator } from "./project-navigator-list";

export function ProjectsLoadingFallback() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border pb-px">
        <ProjectNavigator.HeaderSkeleton />
      </div>
    </div>
  );
}

export function SessionsLoadingFallback() {
  return (
    <div className="flex flex-col gap-px">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-bg">
          <div className="h-3 w-3 rounded-full bg-bg-hover animate-pulse" />
          <div className="h-3 w-16 rounded bg-bg-hover animate-pulse" />
          <div className="h-3 flex-1 max-w-32 rounded bg-bg-hover animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function ChatLoadingFallback() {
  return (
    <div className="flex flex-col h-full items-center justify-center">
      <div className="flex items-center gap-2 text-text-muted">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading conversation...</span>
      </div>
    </div>
  );
}
