"use client";

import { useState, useRef } from "react";
import { Copy } from "@lab/ui/components/copy";
import { Heading } from "@lab/ui/components/heading";
import { Button } from "@lab/ui/components/button";
import { Input } from "@lab/ui/components/input";
import { InputGroup, InputGroupIcon, InputGroupInput } from "@lab/ui/components/input-group";
import { Textarea } from "@lab/ui/components/textarea";
import { Checkbox } from "@lab/ui/components/checkbox";
import { FormField } from "@lab/ui/components/form-field";
import { IconButton } from "@lab/ui/components/icon-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lab/ui/components/table";
import { ActionGroup } from "@lab/ui/components/action-group";
import { Divider } from "@lab/ui/components/divider";
import { Plus, Container, Eye, EyeOff, Pencil, Trash2, Check, X } from "lucide-react";

type EnvVar = { key: string; value: string };

export default function NewProjectPage() {
  const [image, setImage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [permissions, setPermissions] = useState({
    readFiles: true,
    readWriteFiles: false,
    runBashCommands: false,
  });

  const [ports, setPorts] = useState<string[]>([]);
  const [portDraft, setPortDraft] = useState("");
  const [editingPortIndex, setEditingPortIndex] = useState<number | null>(null);
  const [editingPortValue, setEditingPortValue] = useState("");

  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envKeyDraft, setEnvKeyDraft] = useState("");
  const [envValueDraft, setEnvValueDraft] = useState("");
  const [editingEnvIndex, setEditingEnvIndex] = useState<number | null>(null);
  const [editingEnvKey, setEditingEnvKey] = useState("");
  const [editingEnvValue, setEditingEnvValue] = useState("");
  const [revealedEnvIndices, setRevealedEnvIndices] = useState<Set<number>>(new Set());

  const portInputRef = useRef<HTMLInputElement>(null);
  const envKeyInputRef = useRef<HTMLInputElement>(null);

  const addPort = () => {
    if (!portDraft.trim()) return;
    setPorts([...ports, portDraft.trim()]);
    setPortDraft("");
    portInputRef.current?.focus();
  };

  const startEditingPort = (index: number) => {
    setEditingPortIndex(index);
    setEditingPortValue(ports[index] ?? "");
  };

  const saveEditingPort = () => {
    if (editingPortIndex === null || !editingPortValue.trim()) return;
    setPorts(ports.map((p, i) => (i === editingPortIndex ? editingPortValue.trim() : p)));
    setEditingPortIndex(null);
    setEditingPortValue("");
  };

  const cancelEditingPort = () => {
    setEditingPortIndex(null);
    setEditingPortValue("");
  };

  const removePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };

  const addEnvVar = () => {
    if (!envKeyDraft.trim()) return;
    setEnvVars([...envVars, { key: envKeyDraft.trim(), value: envValueDraft }]);
    setEnvKeyDraft("");
    setEnvValueDraft("");
    envKeyInputRef.current?.focus();
  };

  const startEditingEnv = (index: number) => {
    const envVar = envVars[index];
    if (!envVar) return;
    setEditingEnvIndex(index);
    setEditingEnvKey(envVar.key);
    setEditingEnvValue(envVar.value);
  };

  const saveEditingEnv = () => {
    if (editingEnvIndex === null || !editingEnvKey.trim()) return;
    setEnvVars(
      envVars.map((v, i) =>
        i === editingEnvIndex ? { key: editingEnvKey.trim(), value: editingEnvValue } : v,
      ),
    );
    setEditingEnvIndex(null);
    setEditingEnvKey("");
    setEditingEnvValue("");
  };

  const cancelEditingEnv = () => {
    setEditingEnvIndex(null);
    setEditingEnvKey("");
    setEditingEnvValue("");
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    setRevealedEnvIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const toggleEnvReveal = (index: number) => {
    setRevealedEnvIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Heading as="h2" size="xl">
            New Project
          </Heading>
          <Copy muted>Configure a new project with container settings.</Copy>
        </div>

        <div className="flex flex-col gap-6">
          <FormField label="Container Image" hint="e.g., ghcr.io/ridafkih/agent-playground:main">
            <InputGroup>
              <InputGroupIcon>
                <Container />
              </InputGroupIcon>
              <InputGroupInput
                value={image}
                onChange={(e) => setImage(e.currentTarget.value)}
                placeholder="ghcr.io/org/image:tag"
              />
            </InputGroup>
          </FormField>

          <FormField label="Exposed Ports" hint="Ports to expose from the container">
            <form
              className="flex flex-col gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                addPort();
              }}
            >
              <Input
                ref={portInputRef}
                value={portDraft}
                onChange={(e) => setPortDraft(e.currentTarget.value)}
                placeholder="8080"
              />
              <Button type="submit" variant="outline" icon={<Plus className="size-3" />}>
                Add Port
              </Button>
            </form>
            {ports.length > 0 && (
              <Table className="mt-2 border border-border" columns="1fr auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Port</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ports.map((port, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {editingPortIndex === index ? (
                          <Input
                            value={editingPortValue}
                            onChange={(e) => setEditingPortValue(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditingPort();
                              if (e.key === "Escape") cancelEditingPort();
                            }}
                            autoFocus
                          />
                        ) : (
                          port
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingPortIndex === index ? (
                          <ActionGroup className="justify-end">
                            <IconButton icon={<Check />} label="Save" onClick={saveEditingPort} />
                            <IconButton icon={<X />} label="Cancel" onClick={cancelEditingPort} />
                          </ActionGroup>
                        ) : (
                          <ActionGroup className="justify-end">
                            <IconButton
                              icon={<Pencil />}
                              label="Edit"
                              onClick={() => startEditingPort(index)}
                            />
                            <IconButton
                              icon={<Trash2 />}
                              label="Delete"
                              onClick={() => removePort(index)}
                            />
                          </ActionGroup>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FormField>

          <FormField label="Agent Permissions">
            <div className="flex flex-col gap-1">
              <Checkbox
                size="md"
                checked={permissions.readFiles}
                onChange={(checked) => setPermissions({ ...permissions, readFiles: checked })}
              >
                Read files
              </Checkbox>
              <Checkbox
                size="md"
                checked={permissions.readWriteFiles}
                onChange={(checked) => setPermissions({ ...permissions, readWriteFiles: checked })}
              >
                Read and write files
              </Checkbox>
              <Checkbox
                size="md"
                checked={permissions.runBashCommands}
                onChange={(checked) => setPermissions({ ...permissions, runBashCommands: checked })}
              >
                Run bash commands
              </Checkbox>
            </div>
          </FormField>

          <FormField label="Environment Variables">
            <form
              className="flex flex-col gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                addEnvVar();
              }}
            >
              <div className="flex items-center gap-1">
                <Input
                  ref={envKeyInputRef}
                  value={envKeyDraft}
                  onChange={(e) => setEnvKeyDraft(e.currentTarget.value)}
                  placeholder="KEY"
                  mono
                />
                <Input
                  value={envValueDraft}
                  onChange={(e) => setEnvValueDraft(e.currentTarget.value)}
                  placeholder="VALUE"
                />
              </div>
              <Button type="submit" variant="outline" icon={<Plus className="size-3" />}>
                Add Variable
              </Button>
            </form>
            {envVars.length > 0 && (
              <Table className="mt-2 border border-border" columns="1fr 1fr auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envVars.map((envVar, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">
                        {editingEnvIndex === index ? (
                          <Input
                            value={editingEnvKey}
                            onChange={(e) => setEditingEnvKey(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditingEnv();
                              if (e.key === "Escape") cancelEditingEnv();
                            }}
                            mono
                            autoFocus
                          />
                        ) : (
                          envVar.key
                        )}
                      </TableCell>
                      <TableCell>
                        {editingEnvIndex === index ? (
                          <Input
                            value={editingEnvValue}
                            onChange={(e) => setEditingEnvValue(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditingEnv();
                              if (e.key === "Escape") cancelEditingEnv();
                            }}
                          />
                        ) : revealedEnvIndices.has(index) ? (
                          envVar.value
                        ) : (
                          "••••••••"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingEnvIndex === index ? (
                          <ActionGroup className="justify-end">
                            <IconButton icon={<Check />} label="Save" onClick={saveEditingEnv} />
                            <IconButton icon={<X />} label="Cancel" onClick={cancelEditingEnv} />
                          </ActionGroup>
                        ) : (
                          <ActionGroup className="justify-end">
                            <IconButton
                              icon={revealedEnvIndices.has(index) ? <EyeOff /> : <Eye />}
                              label={revealedEnvIndices.has(index) ? "Hide" : "Reveal"}
                              onClick={() => toggleEnvReveal(index)}
                            />
                            <IconButton
                              icon={<Pencil />}
                              label="Edit"
                              onClick={() => startEditingEnv(index)}
                            />
                            <IconButton
                              icon={<Trash2 />}
                              label="Delete"
                              onClick={() => removeEnvVar(index)}
                            />
                          </ActionGroup>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FormField>

          <FormField
            label="System Prompt"
            hint="This will be injected in the system prompt, and is your opportunity to provide the agent some context."
          >
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.currentTarget.value)}
              placeholder="You are a helpful coding assistant..."
              rows={12}
            />
          </FormField>

          <Divider />
          <Button variant="primary" size="md" className="w-full">
            Create Project
          </Button>
        </div>
      </div>
    </div>
  );
}
