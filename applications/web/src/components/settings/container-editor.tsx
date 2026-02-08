"use client";

import { createContext, use, type ReactNode } from "react";
import { Plus, X, Folder } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { FormInput, InputGroup } from "@/components/form-input";

const styles = {
  frame: tv({
    base: "flex flex-col gap-2 p-2 border border-border bg-bg-muted",
  }),
  header: tv({
    slots: {
      root: "flex items-center justify-between",
      title: "text-xs text-text-secondary",
    },
  }),
  section: tv({
    slots: {
      root: "flex flex-col gap-1.5",
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

type EnvVar = {
  id: string;
  key: string;
  value: string;
};

type DependencyDraft = {
  id: string;
  dependsOnDraftId: string;
  condition: string;
};

type ContainerDraft = {
  id: string;
  image: string;
  ports: string;
  isWorkspace: boolean;
  envVars: EnvVar[];
  dependencies: DependencyDraft[];
};

type AvailableContainer = {
  id: string;
  label: string;
};

interface ContainerEditorState {
  container: ContainerDraft;
  containerIndex: number;
  availableContainers: AvailableContainer[];
}

interface ContainerEditorActions {
  update: (updater: (container: ContainerDraft) => ContainerDraft) => void;
  remove: () => void;
}

interface ContainerEditorContextValue {
  state: ContainerEditorState;
  actions: ContainerEditorActions;
}

const ContainerEditorContext = createContext<ContainerEditorContextValue | null>(null);

function useContainerEditor(): ContainerEditorContextValue {
  const context = use(ContainerEditorContext);
  if (!context) {
    throw new Error("ContainerEditor components must be used within ContainerEditor.Provider");
  }
  return context;
}

function getContainerLabel(container: ContainerDraft, index: number): string {
  if (container.image.trim()) {
    const imageName = container.image.split("/").pop() || container.image;
    return imageName.split(":")[0] || `Container ${index + 1}`;
  }
  return `Container ${index + 1}`;
}

function ContainerEditorProvider({
  container,
  containerIndex,
  allContainers,
  onChange,
  onRemove,
  children,
}: {
  container: ContainerDraft;
  containerIndex: number;
  allContainers: ContainerDraft[];
  onChange: (updated: ContainerDraft) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const availableContainers = allContainers
    .map((otherContainer, index) => ({
      id: otherContainer.id,
      label: getContainerLabel(otherContainer, index),
    }))
    .filter((otherContainer) => otherContainer.id !== container.id);

  const update = (updater: (container: ContainerDraft) => ContainerDraft) => {
    onChange(updater(container));
  };

  return (
    <ContainerEditorContext
      value={{
        state: { container, containerIndex, availableContainers },
        actions: { update, remove: onRemove },
      }}
    >
      {children}
    </ContainerEditorContext>
  );
}

function ContainerEditorFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame()}>{children}</div>;
}

function ContainerEditorHeader() {
  const { state, actions } = useContainerEditor();
  const headerStyles = styles.header();

  return (
    <div className={headerStyles.root()}>
      <span className={headerStyles.title()}>
        {getContainerLabel(state.container, state.containerIndex)}
      </span>
      <IconButton onClick={actions.remove}>
        <X size={12} />
      </IconButton>
    </div>
  );
}

function ContainerEditorImageField() {
  const { state, actions } = useContainerEditor();

  return (
    <div className={styles.field()}>
      <FormInput.Label>Image</FormInput.Label>
      <FormInput.Text
        value={state.container.image}
        onChange={(event) =>
          actions.update((container) => ({ ...container, image: event.target.value }))
        }
        placeholder="ghcr.io/org/image:tag"
      />
    </div>
  );
}

function ContainerEditorPortsField() {
  const { state, actions } = useContainerEditor();

  return (
    <div className={styles.field()}>
      <FormInput.Label>Ports</FormInput.Label>
      <FormInput.Text
        value={state.container.ports}
        onChange={(event) =>
          actions.update((container) => ({ ...container, ports: event.target.value }))
        }
        placeholder="3000, 8080"
      />
      <FormInput.Helper>Comma-separated port numbers</FormInput.Helper>
    </div>
  );
}

function EnvVarRow({
  envVar,
  onUpdate,
  onRemove,
}: {
  envVar: EnvVar;
  onUpdate: (updated: EnvVar) => void;
  onRemove: () => void;
}) {
  return (
    <InputGroup.Root>
      <InputGroup.Input
        value={envVar.key}
        onChange={(event) => onUpdate({ ...envVar, key: event.target.value })}
        placeholder="MY_ENV_VAR"
      />
      <InputGroup.Separator>=</InputGroup.Separator>
      <InputGroup.Input
        type="password"
        value={envVar.value}
        onChange={(event) => onUpdate({ ...envVar, value: event.target.value })}
      />
      <InputGroup.Action onClick={onRemove}>
        <X size={10} />
      </InputGroup.Action>
    </InputGroup.Root>
  );
}

function ContainerEditorEnvVarsSection() {
  const { state, actions } = useContainerEditor();
  const sectionStyles = styles.section();

  const handleAdd = () => {
    actions.update((container) => ({
      ...container,
      envVars: [...container.envVars, { id: crypto.randomUUID(), key: "", value: "" }],
    }));
  };

  const handleUpdate = (id: string, updated: EnvVar) => {
    actions.update((container) => ({
      ...container,
      envVars: container.envVars.map((envVar) => (envVar.id === id ? updated : envVar)),
    }));
  };

  const handleRemove = (id: string) => {
    actions.update((container) => ({
      ...container,
      envVars: container.envVars.filter((envVar) => envVar.id !== id),
    }));
  };

  return (
    <div className={sectionStyles.root()}>
      <div className={sectionStyles.header()}>
        <span className={sectionStyles.label()}>Environment Variables</span>
        <Button variant="ghost" onClick={handleAdd}>
          <Plus size={10} />
          Add
        </Button>
      </div>
      {state.container.envVars.length === 0 ? (
        <span className={sectionStyles.empty()}>(None)</span>
      ) : (
        <div className={sectionStyles.content()}>
          {state.container.envVars.map((envVar) => (
            <EnvVarRow
              key={envVar.id}
              envVar={envVar}
              onUpdate={(updated) => handleUpdate(envVar.id, updated)}
              onRemove={() => handleRemove(envVar.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyRow({
  dependency,
  availableContainers,
  onUpdate,
  onRemove,
}: {
  dependency: DependencyDraft;
  availableContainers: AvailableContainer[];
  onUpdate: (updated: DependencyDraft) => void;
  onRemove: () => void;
}) {
  const options = availableContainers.map((container) => ({
    value: container.id,
    label: container.label,
  }));

  return (
    <InputGroup.Root>
      <div className="flex-1">
        <FormInput.Select
          value={dependency.dependsOnDraftId}
          onChange={(value) => onUpdate({ ...dependency, dependsOnDraftId: value })}
          options={options}
          placeholder="Select container..."
        />
      </div>
      <InputGroup.Action onClick={onRemove}>
        <X size={10} />
      </InputGroup.Action>
    </InputGroup.Root>
  );
}

function ContainerEditorDependenciesSection() {
  const { state, actions } = useContainerEditor();
  const sectionStyles = styles.section();

  if (state.availableContainers.length === 0) {
    return null;
  }

  const handleAdd = () => {
    actions.update((container) => ({
      ...container,
      dependencies: [
        ...container.dependencies,
        { id: crypto.randomUUID(), dependsOnDraftId: "", condition: "service_started" },
      ],
    }));
  };

  const handleUpdate = (id: string, updated: DependencyDraft) => {
    actions.update((container) => ({
      ...container,
      dependencies: container.dependencies.map((dependency) =>
        dependency.id === id ? updated : dependency,
      ),
    }));
  };

  const handleRemove = (id: string) => {
    actions.update((container) => ({
      ...container,
      dependencies: container.dependencies.filter((dependency) => dependency.id !== id),
    }));
  };

  return (
    <div className={sectionStyles.root()}>
      <div className={sectionStyles.header()}>
        <span className={sectionStyles.label()}>Depends On</span>
        <Button variant="ghost" onClick={handleAdd}>
          <Plus size={10} />
          Add
        </Button>
      </div>
      {state.container.dependencies.length === 0 ? (
        <span className={sectionStyles.empty()}>(None)</span>
      ) : (
        <div className={sectionStyles.content()}>
          {state.container.dependencies.map((dependency) => (
            <DependencyRow
              key={dependency.id}
              dependency={dependency}
              availableContainers={state.availableContainers}
              onUpdate={(updated) => handleUpdate(dependency.id, updated)}
              onRemove={() => handleRemove(dependency.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerEditorWorkspaceToggle() {
  const { state, actions } = useContainerEditor();
  const isWorkspace = state.container.isWorkspace;

  const handleToggle = () => {
    actions.update((container) => ({ ...container, isWorkspace: !container.isWorkspace }));
  };

  return (
    <Button variant={isWorkspace ? "active" : "primary"} onClick={handleToggle}>
      <Folder size={12} fill={isWorkspace ? "currentColor" : "none"} />
      {isWorkspace ? "Workspace container" : "Set as workspace"}
    </Button>
  );
}

export const ContainerEditor = {
  Provider: ContainerEditorProvider,
  Frame: ContainerEditorFrame,
  Header: ContainerEditorHeader,
  ImageField: ContainerEditorImageField,
  PortsField: ContainerEditorPortsField,
  EnvVarsSection: ContainerEditorEnvVarsSection,
  DependenciesSection: ContainerEditorDependenciesSection,
  WorkspaceToggle: ContainerEditorWorkspaceToggle,
};

export type { ContainerDraft };
