"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Folder } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/button";
import { api } from "@/lib/api";
import type { ProjectContainer } from "@lab/client";

const styles = tv({
  slots: {
    frame: "flex flex-col gap-1.5 p-2 border border-border bg-bg-muted",
    header: "flex items-center justify-between",
    title: "text-xs text-text-secondary",
    image: "text-xs text-text font-mono",
    meta: "text-xs text-text-muted",
    actions: "flex items-center justify-end gap-2 pt-1.5 border-t border-border mt-1",
  },
});

function getContainerLabel(image: string): string {
  const imageName = image.split("/").pop() || image;
  return imageName.split(":")[0] || image;
}

interface ContainerCardState {
  container: ProjectContainer;
  projectId: string;
  allContainers: ProjectContainer[];
  isUpdating: boolean;
}

interface ContainerCardActions {
  setWorkspace: (isWorkspace: boolean) => Promise<void>;
}

interface ContainerCardContextValue {
  state: ContainerCardState;
  actions: ContainerCardActions;
}

const ContainerCardContext = createContext<ContainerCardContextValue | null>(null);

function useContainerCard(): ContainerCardContextValue {
  const context = use(ContainerCardContext);
  if (!context) {
    throw new Error("ContainerCard components must be used within ContainerCard.Provider");
  }
  return context;
}

type ContainerCardProviderProps = {
  container: ProjectContainer;
  projectId: string;
  allContainers: ProjectContainer[];
  onWorkspaceChange: () => void;
  children: ReactNode;
};

function ContainerCardProvider({
  container,
  projectId,
  allContainers,
  onWorkspaceChange,
  children,
}: ContainerCardProviderProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const setWorkspace = async (isWorkspace: boolean) => {
    setIsUpdating(true);
    try {
      await api.containers.setWorkspace(projectId, container.id, isWorkspace);
      onWorkspaceChange();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <ContainerCardContext
      value={{
        state: { container, projectId, allContainers, isUpdating },
        actions: { setWorkspace },
      }}
    >
      {children}
    </ContainerCardContext>
  );
}

function ContainerCardFrame({ children }: { children: ReactNode }) {
  return <div className={styles().frame()}>{children}</div>;
}

function ContainerCardHeader({ children }: { children: ReactNode }) {
  return <div className={styles().header()}>{children}</div>;
}

function ContainerCardTitle() {
  const { state } = useContainerCard();
  return <span className={styles().title()}>{getContainerLabel(state.container.image)}</span>;
}

function ContainerCardImage() {
  const { state } = useContainerCard();
  return <span className={styles().image()}>{state.container.image}</span>;
}

function ContainerCardPorts() {
  const { state } = useContainerCard();
  const portsList = state.container.ports.length > 0 ? state.container.ports.join(", ") : "none";
  return <span className={styles().meta()}>Ports: {portsList}</span>;
}

function ContainerCardDependencies() {
  const { state } = useContainerCard();
  const dependencies = state.container.dependencies ?? [];

  if (dependencies.length === 0) {
    return null;
  }

  const dependencyLabels = dependencies
    .map((dependency) => {
      const depContainer = state.allContainers.find(
        (other) => other.id === dependency.dependsOnContainerId,
      );
      return depContainer ? getContainerLabel(depContainer.image) : null;
    })
    .filter((label): label is string => label !== null);

  if (dependencyLabels.length === 0) {
    return null;
  }

  return <span className={styles().meta()}>Depends on: {dependencyLabels.join(", ")}</span>;
}

function ContainerCardActions({ children }: { children: ReactNode }) {
  return <div className={styles().actions()}>{children}</div>;
}

function ContainerCardWorkspaceToggle() {
  const { state, actions } = useContainerCard();
  const isWorkspace = state.container.isWorkspace;

  return (
    <Button
      variant={isWorkspace ? "active" : "primary"}
      onClick={() => actions.setWorkspace(!isWorkspace)}
      disabled={state.isUpdating}
      title={isWorkspace ? "This is the workspace container" : "Set as workspace container"}
    >
      <Folder size={12} fill={isWorkspace ? "currentColor" : "none"} />
      {isWorkspace ? "Workspace" : "Set as workspace"}
    </Button>
  );
}

export const ContainerCard = {
  Provider: ContainerCardProvider,
  Frame: ContainerCardFrame,
  Header: ContainerCardHeader,
  Title: ContainerCardTitle,
  Image: ContainerCardImage,
  Ports: ContainerCardPorts,
  Dependencies: ContainerCardDependencies,
  Actions: ContainerCardActions,
  WorkspaceToggle: ContainerCardWorkspaceToggle,
};
