export interface AgentConfig {
  opencodeUrl: string;
}

export interface SessionContainer {
  id: string;
  containerId: string;
  dockerId: string;
  hostname?: string;
  permissions: string[];
}

export interface AgentSessionConfig {
  sessionId: string;
  projectId: string;
  systemPrompt?: string;
  containers: SessionContainer[];
  defaultContainerId?: string;
}

export interface ToolInvocation {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AgentEvents {
  token: (content: string) => void;
  message: (message: AgentMessage) => void;
  toolStart: (tool: ToolInvocation) => void;
  toolEnd: (tool: ToolInvocation) => void;
  complete: () => void;
  error: (error: Error) => void;
}

export interface ModelSelection {
  providerId: string;
  modelId: string;
}
