"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";
import {
  ProjectNavigatorList,
  ProjectNavigatorListHeader,
  ProjectNavigatorListItem,
} from "@/components/project-navigator-list";
import { PromptInput } from "@/components/prompt-input";
import {
  SplitPane,
  SplitPanePrimary,
  SplitPaneSecondary,
  useSplitPane,
} from "@/components/split-pane";
import { navItems, mockProjects } from "@/placeholder/data";

function ProjectNavigator() {
  const { selected, select } = useSplitPane();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border py-px">
        {mockProjects.map((project) => (
          <ProjectNavigatorList key={project.id}>
            <ProjectNavigatorListHeader
              name={project.name}
              count={project.sessions.length}
              onAdd={() => console.log("Add session to", project.name)}
            />
            {project.sessions.map((session) => (
              <ProjectNavigatorListItem
                key={session.id}
                status={session.status}
                hash={session.id}
                title={session.title}
                lastMessage={session.lastMessage}
                selected={selected === session.id}
                onClick={() => select(session.id)}
              />
            ))}
          </ProjectNavigatorList>
        ))}
      </div>
    </div>
  );
}

function ConversationPreview({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        Select a session to preview
      </div>
    );
  }

  const session = mockProjects
    .flatMap((project) => project.sessions)
    .find((session) => session.id === sessionId);

  if (!session) return null;

  return (
    <div className="p-4">
      <h2 className="text-lg font-medium">{session.title}</h2>
      <p className="text-text-muted mt-1">{session.lastMessage}</p>
    </div>
  );
}

export default function Page() {
  const [prompt, setPrompt] = useState("");

  return (
    <SplitPane>
      <SplitPanePrimary>
        <Nav items={navItems} activeHref="/projects" />
        <ProjectNavigator />
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => {
            console.log("Submit:", prompt);
            setPrompt("");
          }}
        />
      </SplitPanePrimary>
      <SplitPaneSecondary>
        {(selected) => <ConversationPreview sessionId={selected} />}
      </SplitPaneSecondary>
    </SplitPane>
  );
}
