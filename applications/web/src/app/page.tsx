"use client";

import { useRef } from "react";
import { CenteredLayout } from "@/components/centered-layout";
import { Nav } from "@/components/nav";
import { Orchestration } from "@/components/orchestration";
import { SessionList } from "@/components/session-list";
import { TextAreaGroup } from "@/components/textarea-group";
import { defaultSettingsTab } from "@/config/settings";
import { useModelSelection } from "@/lib/hooks";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];

import { useOrchestrate } from "@/lib/use-orchestrate";

function mapToIndicatorStatus(
  status: string
): "thinking" | "delegating" | "starting" | null {
  if (status === "pending" || status === "thinking") {
    return "thinking";
  }
  if (status === "delegating") {
    return "delegating";
  }
  if (status === "starting") {
    return "starting";
  }
  return null;
}

function OrchestratorPrompt() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { models, modelId, setModelId } = useModelSelection();
  const firstModel = models?.[0];
  const { submit, state } = useOrchestrate();
  const indicatorStatus = mapToIndicatorStatus(state.status);

  const handleSubmit = () => {
    const { current: textarea } = textareaRef;
    if (!textarea) {
      return;
    }

    const { value } = textarea;
    if (!value) {
      return;
    }
    submit(value);

    textarea.value = "";
  };

  return (
    <div className="w-full">
      {indicatorStatus && (
        <div className="mb-2 flex flex-col gap-2">
          <Orchestration.Indicator
            projectName={state.projectName ?? undefined}
            status={indicatorStatus}
          />
        </div>
      )}
      <TextAreaGroup.Provider
        actions={{ onSubmit: handleSubmit }}
        meta={{ textareaRef }}
        state={{ attachments: [] }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input />
          <TextAreaGroup.Toolbar>
            {firstModel && (
              <TextAreaGroup.ModelSelector
                models={models ?? []}
                onChange={setModelId}
                value={modelId ?? firstModel.value}
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
    <div className="flex h-screen flex-col">
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
