"use client";

import { useState, type ReactNode } from "react";
import { tv } from "tailwind-variants";
import { ArrowLeft, Box, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FormInput, InputGroup } from "./form-input";
import { useAppView } from "./app-view";
import { IconButton } from "./icon-button";
import { Tabs } from "./tabs";
import { mockProjects } from "@/placeholder/data";

type SettingsTab = "github" | "providers" | "projects";

const backButton = tv({
  base: "flex items-center gap-1.5 text-xs text-text-muted hover:text-text",
});

const primaryButton = tv({
  base: "self-start px-2 py-1 text-xs bg-bg-muted border border-border text-text hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed",
});

const destructiveButton = tv({
  base: "px-2 py-1 text-xs border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed",
});

const buttonRow = tv({
  base: "flex items-center gap-2",
});

const containerDisplay = tv({
  slots: {
    root: "flex flex-col gap-1.5 p-2 border border-border bg-bg-muted",
    header: "text-xs text-text-secondary",
    image: "text-xs text-text font-mono",
    meta: "text-xs text-text-muted",
  },
});

function SettingsFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col h-full overflow-hidden">{children}</div>;
}

function SettingsHeader() {
  const { setView } = useAppView();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
      <IconButton onClick={() => setView("projects")}>
        <ArrowLeft size={14} />
      </IconButton>
      <span className="text-text font-medium">Settings</span>
    </div>
  );
}

function SettingsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-2 max-w-sm">{children}</div>
    </div>
  );
}

function SettingsFormField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function GitHubTab() {
  const [pat, setPat] = useState("");
  const [username, setUsername] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [attributeAgent, setAttributeAgent] = useState(true);

  const handleSave = () => {};

  return (
    <SettingsPanel>
      <SettingsFormField>
        <FormInput.Label>Personal Access Token</FormInput.Label>
        <FormInput.Password
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
        />
      </SettingsFormField>

      <SettingsFormField>
        <FormInput.Label>Username</FormInput.Label>
        <FormInput.Text
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your-github-username"
        />
      </SettingsFormField>

      <SettingsFormField>
        <FormInput.Label>Commit Author Name</FormInput.Label>
        <FormInput.Text
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your Name"
        />
      </SettingsFormField>

      <SettingsFormField>
        <FormInput.Label>Commit Author Email</FormInput.Label>
        <FormInput.Text
          type="email"
          value={authorEmail}
          onChange={(e) => setAuthorEmail(e.target.value)}
          placeholder="my-agent@example.com"
        />
      </SettingsFormField>

      <FormInput.Checkbox
        checked={attributeAgent}
        onChange={setAttributeAgent}
        label="Attribute agent to commits"
      />

      <button
        type="button"
        onClick={handleSave}
        className="self-start px-2 py-1 text-xs bg-bg-muted border border-border text-text hover:bg-bg-hover"
      >
        Save
      </button>
    </SettingsPanel>
  );
}

const aiProviderOptions = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
];

function ProvidersTab() {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");

  const handleSave = () => {};

  return (
    <SettingsPanel>
      <SettingsFormField>
        <FormInput.Label>Provider</FormInput.Label>
        <FormInput.Select options={aiProviderOptions} value={provider} onChange={setProvider} />
      </SettingsFormField>

      <SettingsFormField>
        <FormInput.Label>API Key</FormInput.Label>
        <FormInput.Password
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-xxxxxxxxxxxx"
        />
      </SettingsFormField>

      <button
        type="button"
        onClick={handleSave}
        className="self-start px-2 py-1 text-xs bg-bg-muted border border-border text-text hover:bg-bg-hover"
      >
        Save
      </button>
    </SettingsPanel>
  );
}

type ProjectsView = { page: "list" } | { page: "detail"; projectId: string } | { page: "create" };

function ProjectsList({
  onSelect,
  onCreate,
}: {
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Projects</span>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <Plus size={12} />
          Create New
        </button>
      </div>

      <div className="flex flex-col gap-px bg-border border border-border">
        {mockProjects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 bg-bg text-xs text-left hover:bg-bg-hover"
          >
            <Box size={12} className="text-text-muted shrink-0" />
            <span className="text-text truncate">{project.name}</span>
            <ChevronRight size={12} className="text-text-muted ml-auto shrink-0" />
          </button>
        ))}
      </div>
    </>
  );
}

function ContainerDisplay({
  container,
}: {
  container: (typeof mockProjects)[number]["containers"][number];
}) {
  const styles = containerDisplay();
  const portsList = container.ports.length > 0 ? container.ports.join(", ") : "none";
  const envCount = Object.keys(container.env).length;

  return (
    <div className={styles.root()}>
      <span className={styles.header()}>Container</span>
      <span className={styles.image()}>{container.image}</span>
      <span className={styles.meta()}>
        Ports: {portsList} · {envCount} env var{envCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ProjectDetail({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const project = mockProjects.find((proj) => proj.id === projectId);

  if (!project) {
    return (
      <SettingsPanel>
        <span className="text-xs text-text-muted">Project not found</span>
      </SettingsPanel>
    );
  }

  const handleSave = () => {
    console.log("Saving project:", project.id);
  };

  const handleArchive = () => {
    console.log("Archiving project:", project.id);
    onBack();
  };

  return (
    <>
      <button type="button" onClick={onBack} className={backButton()}>
        <ArrowLeft size={12} />
        Back to projects
      </button>

      <SettingsFormField>
        <FormInput.Label>Project Name</FormInput.Label>
        <FormInput.Text value={project.name} readOnly />
      </SettingsFormField>

      {project.systemPrompt && (
        <SettingsFormField>
          <FormInput.Label>System Prompt</FormInput.Label>
          <FormInput.Textarea value={project.systemPrompt} readOnly rows={3} />
        </SettingsFormField>
      )}

      <div className={containersSection()}>
        <span className="text-xs text-text-secondary">Containers</span>
        {project.containers.length === 0 ? (
          <span className={listSectionEmpty()}>No containers configured</span>
        ) : (
          <div className="flex flex-col gap-2">
            {project.containers.map((container) => (
              <ContainerDisplay key={container.id} container={container} />
            ))}
          </div>
        )}
      </div>

      <div className={buttonRow()}>
        <button type="button" onClick={handleSave} className={primaryButton()}>
          Save Changes
        </button>
        <button type="button" onClick={handleArchive} className={destructiveButton()}>
          Archive
        </button>
      </div>
    </>
  );
}

type EnvVar = {
  id: string;
  key: string;
  value: string;
};

type ContainerDraft = {
  id: string;
  image: string;
  ports: string;
  envVars: EnvVar[];
};

const parsePorts = (portsString: string): number[] => {
  return portsString
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => parseInt(segment, 10))
    .filter((port) => !isNaN(port) && port > 0 && port <= 65535);
};

const envVarsToRecord = (envVars: EnvVar[]): Record<string, string> => {
  const entries = envVars
    .map((envVar) => [envVar.key.trim(), envVar.value] as const)
    .filter(([key]) => key.length > 0);
  return Object.fromEntries(entries);
};

const listSectionHeader = tv({
  slots: {
    root: "flex items-center justify-between",
    label: "text-xs text-text-secondary",
    addButton: "flex items-center gap-1 text-xs text-text-muted hover:text-text",
  },
});

const listSectionContent = tv({
  base: "flex flex-col",
  variants: {
    gap: {
      1: "gap-1",
      2: "gap-2",
    },
  },
  defaultVariants: {
    gap: 2,
  },
});

const listSectionEmpty = tv({
  base: "text-xs text-text-muted",
});

const containerEditor = tv({
  slots: {
    root: "flex flex-col gap-2 p-2 border border-border bg-bg-muted",
    header: "flex items-center justify-between",
    title: "text-xs text-text-secondary",
    removeButton: "text-text-muted hover:text-text",
    envSection: "flex flex-col gap-1.5",
  },
});

const addLinkButton = tv({
  base: "flex items-center gap-1 text-xs text-text-muted hover:text-text self-start",
});

const containersSection = tv({
  base: "flex flex-col gap-2",
});

function ListSectionHeader({
  label,
  onAdd,
  addLabel,
  iconSize = 12,
}: {
  label: string;
  onAdd: () => void;
  addLabel: string;
  iconSize?: number;
}) {
  const styles = listSectionHeader();

  return (
    <div className={styles.root()}>
      <span className={styles.label()}>{label}</span>
      <button type="button" onClick={onAdd} className={styles.addButton()}>
        <Plus size={iconSize} />
        {addLabel}
      </button>
    </div>
  );
}

function ListSectionContent({
  items,
  emptyText,
  children,
  gap,
  className,
}: {
  items: unknown[];
  emptyText: string;
  children: ReactNode;
  gap?: 1 | 2;
  className?: string;
}) {
  if (items.length === 0) {
    return <span className={listSectionEmpty()}>{emptyText}</span>;
  }
  return <div className={cn(listSectionContent({ gap }), className)}>{children}</div>;
}

function EnvVarRow({
  envVar,
  onChange,
  onRemove,
}: {
  envVar: EnvVar;
  onChange: (updated: EnvVar) => void;
  onRemove: () => void;
}) {
  return (
    <InputGroup.Root>
      <InputGroup.Input
        value={envVar.key}
        onChange={(event) => onChange({ ...envVar, key: event.target.value })}
        placeholder="MY_ENV_VAR"
      />
      <InputGroup.Separator>=</InputGroup.Separator>
      <InputGroup.Input
        type="password"
        value={envVar.value}
        onChange={(event) => onChange({ ...envVar, value: event.target.value })}
      />
      <InputGroup.Action onClick={onRemove}>
        <X size={10} />
      </InputGroup.Action>
    </InputGroup.Root>
  );
}

function ContainerEditor({
  container,
  onChange,
  onRemove,
}: {
  container: ContainerDraft;
  onChange: (updated: ContainerDraft) => void;
  onRemove: () => void;
}) {
  const styles = containerEditor();

  const handleAddEnvVar = () => {
    onChange({
      ...container,
      envVars: [...container.envVars, { id: crypto.randomUUID(), key: "", value: "" }],
    });
  };

  const handleEnvVarChange = (id: string, updated: EnvVar) => {
    onChange({
      ...container,
      envVars: container.envVars.map((envVar) => (envVar.id === id ? updated : envVar)),
    });
  };

  const handleEnvVarRemove = (id: string) => {
    onChange({
      ...container,
      envVars: container.envVars.filter((envVar) => envVar.id !== id),
    });
  };

  return (
    <div className={styles.root()}>
      <div className={styles.header()}>
        <span className={styles.title()}>Container</span>
        <button type="button" onClick={onRemove} className={styles.removeButton()}>
          <X size={12} />
        </button>
      </div>

      <SettingsFormField>
        <FormInput.Label>Image</FormInput.Label>
        <FormInput.Text
          value={container.image}
          onChange={(event) => onChange({ ...container, image: event.target.value })}
          placeholder="ghcr.io/org/image:tag"
        />
      </SettingsFormField>

      <SettingsFormField>
        <FormInput.Label>Ports</FormInput.Label>
        <FormInput.Text
          value={container.ports}
          onChange={(event) => onChange({ ...container, ports: event.target.value })}
          placeholder="3000, 8080"
        />
        <FormInput.Helper>Comma-separated port numbers</FormInput.Helper>
      </SettingsFormField>

      <div className={styles.envSection()}>
        <ListSectionHeader
          label="Environment Variables"
          onAdd={handleAddEnvVar}
          addLabel="Add"
          iconSize={10}
        />
        <ListSectionContent items={container.envVars} emptyText="(None)" gap={1}>
          {container.envVars.map((envVar) => (
            <EnvVarRow
              key={envVar.id}
              envVar={envVar}
              onChange={(updated) => handleEnvVarChange(envVar.id, updated)}
              onRemove={() => handleEnvVarRemove(envVar.id)}
            />
          ))}
        </ListSectionContent>
      </div>
    </div>
  );
}

function ProjectCreate({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [containers, setContainers] = useState<ContainerDraft[]>([]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const handleAddContainer = () => {
    setContainers([...containers, { id: crypto.randomUUID(), image: "", ports: "", envVars: [] }]);
  };

  const handleContainerChange = (id: string, updated: ContainerDraft) => {
    setContainers(containers.map((container) => (container.id === id ? updated : container)));
  };

  const handleContainerRemove = (id: string) => {
    setContainers(containers.filter((container) => container.id !== id));
  };

  const isNameValid = name.trim().length > 0;
  const areContainersValid = containers.every((container) => container.image.trim().length > 0);
  const canSubmit = isNameValid && areContainersValid;

  const handleCreate = () => {
    if (!canSubmit) return;

    const payload = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim() || undefined,
      containers: containers.map((container) => ({
        image: container.image.trim(),
        ports: parsePorts(container.ports),
        env: envVarsToRecord(container.envVars),
      })),
    };

    console.log("Creating project:", payload);

    setName("");
    setSystemPrompt("");
    setContainers([]);
    setShowSystemPrompt(false);
    onBack();
  };

  return (
    <>
      <button type="button" onClick={onBack} className={backButton()}>
        <ArrowLeft size={12} />
        Back to projects
      </button>

      <SettingsFormField>
        <FormInput.Label required>Project Name</FormInput.Label>
        <FormInput.Text
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="my-project"
        />
      </SettingsFormField>

      {showSystemPrompt ? (
        <SettingsFormField>
          <FormInput.Label>System Prompt</FormInput.Label>
          <FormInput.Textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Context for the AI agent..."
            rows={4}
          />
          <FormInput.Helper>Context for the AI agent</FormInput.Helper>
        </SettingsFormField>
      ) : (
        <button type="button" onClick={() => setShowSystemPrompt(true)} className={addLinkButton()}>
          <Plus size={12} />
          Add system prompt
        </button>
      )}

      <div className={containersSection()}>
        <ListSectionHeader label="Containers" onAdd={handleAddContainer} addLabel="Add Container" />
        <ListSectionContent items={containers} emptyText="(No containers yet)">
          {containers.map((container) => (
            <ContainerEditor
              key={container.id}
              container={container}
              onChange={(updated) => handleContainerChange(container.id, updated)}
              onRemove={() => handleContainerRemove(container.id)}
            />
          ))}
        </ListSectionContent>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={!canSubmit}
        className={primaryButton()}
      >
        Create Project
      </button>
    </>
  );
}

function ProjectsTab() {
  const [view, setView] = useState<ProjectsView>({ page: "list" });

  return (
    <SettingsPanel>
      {view.page === "list" && (
        <ProjectsList
          onSelect={(id) => setView({ page: "detail", projectId: id })}
          onCreate={() => setView({ page: "create" })}
        />
      )}
      {view.page === "detail" && (
        <ProjectDetail projectId={view.projectId} onBack={() => setView({ page: "list" })} />
      )}
      {view.page === "create" && <ProjectCreate onBack={() => setView({ page: "list" })} />}
    </SettingsPanel>
  );
}

function SettingsContent() {
  return (
    <Tabs.Root<SettingsTab> defaultTab="github">
      <Tabs.List>
        <Tabs.Tab value="github">GitHub</Tabs.Tab>
        <Tabs.Tab value="providers">Providers</Tabs.Tab>
        <Tabs.Tab value="projects">Projects</Tabs.Tab>
      </Tabs.List>
      <Tabs.Content value="github">
        <GitHubTab />
      </Tabs.Content>
      <Tabs.Content value="providers">
        <ProvidersTab />
      </Tabs.Content>
      <Tabs.Content value="projects">
        <ProjectsTab />
      </Tabs.Content>
    </Tabs.Root>
  );
}

const Settings = {
  Frame: SettingsFrame,
  Header: SettingsHeader,
  Content: SettingsContent,
  Panel: SettingsPanel,
  FormField: SettingsFormField,
};

export { Settings, type SettingsTab };
