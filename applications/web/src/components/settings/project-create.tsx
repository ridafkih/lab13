"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Plus } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/button";
import { FormInput } from "@/components/form-input";
import { ContainerEditor, type ContainerDraft } from "@/components/settings/container-editor";
import { api } from "@/lib/api";

const styles = {
  section: tv({
    slots: {
      root: "flex flex-col gap-2",
      header: "flex items-center justify-between",
      label: "text-xs text-text-secondary",
      empty: "text-xs text-text-muted",
      content: "flex flex-col gap-2",
    },
  }),
  field: tv({
    base: "flex flex-col gap-1",
  }),
};

const parsePorts = (portsString: string): number[] => {
  return portsString
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => parseInt(segment, 10))
    .filter((port) => !isNaN(port) && port > 0 && port <= 65535);
};

function sortContainersByDependencies(containers: ContainerDraft[]): ContainerDraft[] {
  const sorted: ContainerDraft[] = [];
  const remaining = new Set(containers.map((container) => container.id));
  const containerMap = new Map(containers.map((container) => [container.id, container]));

  while (remaining.size > 0) {
    let addedAny = false;

    for (const id of remaining) {
      const container = containerMap.get(id);
      if (!container) continue;

      const unresolvedDeps = container.dependencies.filter(
        (dependency) => dependency.dependsOnDraftId && remaining.has(dependency.dependsOnDraftId),
      );

      if (unresolvedDeps.length === 0) {
        sorted.push(container);
        remaining.delete(id);
        addedAny = true;
      }
    }

    if (!addedAny && remaining.size > 0) {
      for (const id of remaining) {
        const container = containerMap.get(id);
        if (container) sorted.push(container);
      }
      break;
    }
  }

  return sorted;
}

function FormField({ children }: { children: ReactNode }) {
  return <div className={styles.field()}>{children}</div>;
}

function ContainersSection({
  containers,
  onAdd,
  onChange,
  onRemove,
}: {
  containers: ContainerDraft[];
  onAdd: () => void;
  onChange: (id: string, updated: ContainerDraft) => void;
  onRemove: (id: string) => void;
}) {
  const sectionStyles = styles.section();

  return (
    <div className={sectionStyles.root()}>
      <div className={sectionStyles.header()}>
        <span className={sectionStyles.label()}>Containers</span>
        <Button variant="ghost" onClick={onAdd}>
          <Plus size={12} />
          Add Container
        </Button>
      </div>
      {containers.length === 0 ? (
        <span className={sectionStyles.empty()}>(No containers yet)</span>
      ) : (
        <div className={sectionStyles.content()}>
          {containers.map((container, index) => (
            <ContainerEditor.Provider
              key={container.id}
              container={container}
              containerIndex={index}
              allContainers={containers}
              onChange={(updated) => onChange(container.id, updated)}
              onRemove={() => onRemove(container.id)}
            >
              <ContainerEditor.Frame>
                <ContainerEditor.Header />
                <ContainerEditor.ImageField />
                <ContainerEditor.PortsField />
                <ContainerEditor.EnvVarsSection />
                <ContainerEditor.DependenciesSection />
              </ContainerEditor.Frame>
            </ContainerEditor.Provider>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectCreate() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [containers, setContainers] = useState<ContainerDraft[]>([]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleAddContainer = () => {
    setContainers([
      ...containers,
      {
        id: crypto.randomUUID(),
        image: "",
        ports: "",
        isWorkspace: false,
        envVars: [],
        dependencies: [],
      },
    ]);
  };

  const handleContainerChange = (id: string, updated: ContainerDraft) => {
    setContainers(containers.map((container) => (container.id === id ? updated : container)));
  };

  const handleContainerRemove = (id: string) => {
    setContainers(containers.filter((container) => container.id !== id));
  };

  const isNameValid = name.trim().length > 0;
  const areContainersValid = containers.every((container) => container.image.trim().length > 0);
  const canSubmit = isNameValid && areContainersValid && !isCreating;

  const handleCreate = async () => {
    if (!canSubmit) return;

    setIsCreating(true);
    try {
      const project = await api.projects.create({
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
      });

      const sortedContainers = sortContainersByDependencies(containers);
      const draftIdToRealId = new Map<string, string>();

      await sortedContainers.reduce(async (previous, containerDraft) => {
        await previous;

        const validDependencies = containerDraft.dependencies
          .filter((dependency) => dependency.dependsOnDraftId)
          .map((dependency) => {
            const realId = draftIdToRealId.get(dependency.dependsOnDraftId);
            if (!realId) return null;
            return { containerId: realId, condition: dependency.condition };
          })
          .filter(
            (dependency): dependency is { containerId: string; condition: string } =>
              dependency !== null,
          );

        const createdContainer = await api.containers.create(project.id, {
          image: containerDraft.image.trim(),
          ports: parsePorts(containerDraft.ports),
          dependsOn: validDependencies.length > 0 ? validDependencies : undefined,
        });

        draftIdToRealId.set(containerDraft.id, createdContainer.id);

        if (containerDraft.isWorkspace) {
          await api.containers.setWorkspace(project.id, createdContainer.id, true);
        }
      }, Promise.resolve());

      await mutate("projects");
      router.push("/settings/projects");
    } catch {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-2 max-w-sm">
        <FormField>
          <FormInput.Label required>Project Name</FormInput.Label>
          <FormInput.Text
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-project"
          />
        </FormField>

        <FormField>
          <FormInput.Label>Description</FormInput.Label>
          <FormInput.Text
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A brief description of this project"
          />
          <FormInput.Helper>Used for task routing in orchestration</FormInput.Helper>
        </FormField>

        {showSystemPrompt ? (
          <FormField>
            <FormInput.Label>System Prompt</FormInput.Label>
            <FormInput.Textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="Context for the AI agent..."
              rows={4}
            />
            <FormInput.Helper>Context for the AI agent</FormInput.Helper>
          </FormField>
        ) : (
          <Button variant="ghost" onClick={() => setShowSystemPrompt(true)} className="self-start">
            <Plus size={12} />
            Add system prompt
          </Button>
        )}

        <ContainersSection
          containers={containers}
          onAdd={handleAddContainer}
          onChange={handleContainerChange}
          onRemove={handleContainerRemove}
        />

        <Button onClick={handleCreate} disabled={!canSubmit} className="self-start">
          {isCreating ? "Creating..." : "Create Project"}
        </Button>
      </div>
    </div>
  );
}
