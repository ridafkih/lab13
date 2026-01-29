export interface Project {
  id: string;
  name: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  systemPrompt?: string;
}

export interface Container {
  id: string;
  projectId: string;
  image: string;
  hostname: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContainerInput {
  image: string;
  hostname?: string;
  ports?: number[];
}

export interface Session {
  id: string;
  projectId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type AgentStatus = { status: "inactive" } | { status: "active"; isProcessing: boolean };

export interface Model {
  providerId: string;
  providerName: string;
  modelId: string;
  name: string;
}
