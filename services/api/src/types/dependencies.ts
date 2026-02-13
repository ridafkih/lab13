import type { AppSchema } from "@lab/multiplayer-sdk";
import type { Publisher as PublisherBase } from "@lab/multiplayer-server";
import type { Widelog as WidelogBase } from "@lab/widelogger";

export type { Sandbox } from "@lab/sandbox-sdk";

export interface AcpEvent {
  type: string;
  sequence: number;
  data: Record<string, unknown>;
}

export interface AcpInfo {
  id: string;
  name: string;
  installed: boolean;
  capabilities: {
    permissions: boolean;
    questions: boolean;
  };
}

export interface AcpModel {
  id: string;
  name: string;
}

export type Publisher = PublisherBase<AppSchema>;
export type Widelog = WidelogBase;
