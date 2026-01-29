"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { SessionView } from "@/components/session-view";
import { SessionSidebar } from "@/components/session-sidebar";
import type { ReviewableFile } from "@/types/review";
import { useMultiplayer } from "@/lib/multiplayer/client";
import { ParamValue } from "next/dist/server/request/params";

export default function SessionPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId !== "string" ? "" : params.sessionId;

  const { send, connectionState, useChannel } = useMultiplayer();

  const messages = useChannel("sessionMessages", { uuid: sessionId });
  const changedFiles = useChannel("sessionChangedFiles", { uuid: sessionId });
  const branches = useChannel("sessionBranches", { uuid: sessionId });
  const links = useChannel("sessionLinks", { uuid: sessionId });
  const promptEngineers = useChannel("sessionPromptEngineers", { uuid: sessionId });
  const logSources = useChannel("sessionLogs", { uuid: sessionId });

  const [localReviewFiles, setLocalReviewFiles] = useState<ReviewableFile[]>([]);
  const reviewFiles = changedFiles.length > 0 ? changedFiles : localReviewFiles;

  const handleSendMessage = (content: string) => {
    send(sessionId, { type: "send_message", content });
  };

  const handleTyping = (isTyping: boolean) => {
    send(sessionId, { type: "set_typing", isTyping });
  };

  const handleDismissFile = (path: string) => {
    setLocalReviewFiles((files) =>
      files.map((f) => (f.path === path ? { ...f, status: "dismissed" as const } : f)),
    );
  };

  if (connectionState.status === "connecting" || connectionState.status === "reconnecting") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <SessionView
        messages={messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
      <SessionSidebar
        promptEngineers={promptEngineers}
        branches={branches}
        tasks={[]}
        links={links}
        containers={[]}
        logSources={logSources.map((source) => ({
          id: source.id,
          name: source.name,
          logs: [],
        }))}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
    </div>
  );
}
