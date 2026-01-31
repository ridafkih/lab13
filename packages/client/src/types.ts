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

export interface SessionContainer {
  id: string;
  name: string;
  status: "starting" | "running" | "stopped";
  urls: string[];
}

export type SessionStatus = "creating" | "loading" | "running" | "idle" | "complete";

export interface Session {
  id: string;
  projectId: string;
  title: string | null;
  opencodeSessionId: string | null;
  status: SessionStatus;
  containers?: SessionContainer[];
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  providerId: string;
  providerName: string;
  modelId: string;
  name: string;
}
