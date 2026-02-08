"use client";

import { useRef } from "react";
import { CenteredLayout } from "@/components/centered-layout";
import { Nav } from "@/components/nav";
import { TextAreaGroup } from "@/components/textarea-group";
import { Orchestration } from "@/components/orchestration";
import { SessionList } from "@/components/session-list";
import { defaultSettingsTab } from "@/config/settings";
import { useModelSelection } from "@/lib/hooks";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];
import { useOrchestrate } from "@/lib/use-orchestrate";

function mapToIndicatorStatus(status: string): "thinking" | "delegating" | "starting" | null {
  if (status === "pending" || status === "thinking") return "thinking";
  if (status === "delegating") return "delegating";
  if (status === "starting") return "starting";
  return null;
}

function OrchestratorPrompt() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { modelGroups, modelId, setModelId } = useModelSelection();
  const { submit, state } = useOrchestrate();
  const indicatorStatus = mapToIndicatorStatus(state.status);

  const handleSubmit = () => {
    const { current: textarea } = textareaRef;
    if (!textarea) return;

    const { value } = textarea;
    if (!value) return;
    submit(value);

    textarea.value = "";
  };

  return (
    <div className="w-full">
      {indicatorStatus && (
        <div className="flex flex-col gap-2 mb-2">
          <Orchestration.Indicator
            status={indicatorStatus}
            projectName={state.projectName ?? undefined}
          />
        </div>
      )}
      <TextAreaGroup.Provider
        state={{ attachments: [] }}
        actions={{ onSubmit: handleSubmit }}
        meta={{ textareaRef }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input />
          <TextAreaGroup.Toolbar>
            {modelGroups && modelId && (
              <TextAreaGroup.ModelSelector
                value={modelId}
                groups={modelGroups}
                onChange={setModelId}
              />
            )}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex flex-col h-screen">
      <Nav items={navItems} />
      <CenteredLayout.Root>
        <CenteredLayout.Hero>
          <OrchestratorPrompt />
        </CenteredLayout.Hero>
        <CenteredLayout.Content>
          <SessionList.View />
        </CenteredLayout.Content>
      </CenteredLayout.Root>
    </div>
  );
}
