export type ToolStatus = "pending" | "running" | "completed" | "error";

export type ToolRendererProps = {
  tool: string;
  callId?: string;
  input?: Record<string, unknown>;
  output?: string | null;
  error?: string | null;
  status: ToolStatus;
};
