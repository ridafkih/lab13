"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@lab/ui/components/heading";
import { Copy } from "@lab/ui/components/copy";
import { ContainerList } from "@/components/new-project/container-list";
import { ContainerConfig } from "@/components/new-project/container-config";
import { createEmptyContainer, type Container } from "@/components/new-project/types";
import { useCreateProject, useApiClient } from "@/lib/api";

type View = { type: "list" } | { type: "config"; containerId: string };

export default function NewProjectPage() {
  const router = useRouter();
  const client = useApiClient();
  const { createProject, isLoading, error } = useCreateProject();

  const [name, setName] = useState("");
  const [containers, setContainers] = useState<Container[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [view, setView] = useState<View>({ type: "list" });

  const addContainer = () => {
    const newContainer = createEmptyContainer();
    setContainers([...containers, newContainer]);
    setView({ type: "config", containerId: newContainer.id });
  };

  const updateContainer = (updated: Container) => {
    setContainers(containers.map((c) => (c.id === updated.id ? updated : c)));
  };

  const deleteContainer = (id: string) => {
    setContainers(containers.filter((c) => c.id !== id));
  };

  const handleCreateProject = async () => {
    const project = await createProject({ name, systemPrompt });

    await Promise.all(
      containers.map((container) =>
        client.containers.create(project.id, { image: container.image }),
      ),
    );

    router.push(`/${project.id}`);
  };

  const selectedContainer =
    view.type === "config" ? containers.find((c) => c.id === view.containerId) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Heading as="h2" size="xl">
            New Project
          </Heading>
          <Copy muted>Configure a new project with container settings.</Copy>
        </div>

        {view.type === "list" && (
          <ContainerList
            name={name}
            onNameChange={setName}
            containers={containers}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            onAddContainer={addContainer}
            onSelectContainer={(id) => setView({ type: "config", containerId: id })}
            onDeleteContainer={deleteContainer}
            onCreateProject={handleCreateProject}
            isCreating={isLoading}
            error={error}
          />
        )}

        {view.type === "config" && selectedContainer && (
          <ContainerConfig
            container={selectedContainer}
            onUpdate={updateContainer}
            onBack={() => setView({ type: "list" })}
          />
        )}
      </div>
    </div>
  );
}
