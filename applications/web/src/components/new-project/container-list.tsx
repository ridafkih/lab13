import { Button } from "@lab/ui/components/button";
import { Input } from "@lab/ui/components/input";
import { Textarea } from "@lab/ui/components/textarea";
import { FormField } from "@lab/ui/components/form-field";
import { Divider } from "@lab/ui/components/divider";
import { EmptyState } from "@lab/ui/components/empty-state";
import { Plus, Container } from "lucide-react";
import { ContainerCard } from "./container-card";
import type { Container as ContainerType } from "./types";

interface ContainerListProps {
  name: string;
  onNameChange: (value: string) => void;
  containers: ContainerType[];
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onAddContainer: () => void;
  onSelectContainer: (id: string) => void;
  onDeleteContainer: (id: string) => void;
  onCreateProject: () => void;
}

export function ContainerList({
  name,
  onNameChange,
  containers,
  systemPrompt,
  onSystemPromptChange,
  onAddContainer,
  onSelectContainer,
  onDeleteContainer,
  onCreateProject,
}: ContainerListProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormField label="Project Name">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.currentTarget.value)}
          placeholder="My Project"
        />
      </FormField>

      <FormField
        label="System Prompt"
        hint="This will be injected in the system prompt, and is your opportunity to provide the agent some context."
      >
        <Textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.currentTarget.value)}
          placeholder="You are a helpful coding assistant..."
          rows={4}
        />
      </FormField>

      <FormField label="Containers" hint="Add containers to your project">
        <div className="flex flex-col gap-2">
          {containers.length === 0 ? (
            <EmptyState
              icon={<Container className="size-8" />}
              title="No containers yet"
              description="Add a container to get started"
            />
          ) : (
            containers.map((container) => (
              <ContainerCard
                key={container.id}
                container={container}
                onClick={() => onSelectContainer(container.id)}
                onDelete={() => onDeleteContainer(container.id)}
              />
            ))
          )}
          <Button variant="outline" icon={<Plus className="size-3" />} onClick={onAddContainer}>
            Add Container
          </Button>
        </div>
      </FormField>

      <Divider />
      <Button
        variant="primary"
        size="md"
        className="w-full"
        disabled={containers.length === 0}
        onClick={onCreateProject}
      >
        Create Project
      </Button>
    </div>
  );
}
