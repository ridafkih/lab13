import { z } from "zod";

export const DesiredState = z.enum(["running", "stopped"]);
export type DesiredState = z.infer<typeof DesiredState>;

export const CurrentState = z.enum([
  "pending",
  "stopped",
  "starting",
  "running",
  "stopping",
  "error",
]);
export type CurrentState = z.infer<typeof CurrentState>;

export const BrowserSessionState = z.object({
  sessionId: z.string().uuid(),
  desiredState: DesiredState,
  currentState: CurrentState,
  streamPort: z.number().int().positive().nullable(),
  lastUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  lastHeartbeat: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BrowserSessionState = z.infer<typeof BrowserSessionState>;

export const DaemonStatus = z.object({
  running: z.boolean(),
  ready: z.boolean(),
  port: z.number().int().positive().nullable(),
});
export type DaemonStatus = z.infer<typeof DaemonStatus>;

export const SessionSnapshot = z.object({
  sessionId: z.string().uuid(),
  desiredState: DesiredState,
  currentState: CurrentState,
  streamPort: z.number().int().positive().optional(),
  errorMessage: z.string().optional(),
  subscriberCount: z.number().int().nonnegative(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

export const PortRange = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
});
export type PortRange = z.infer<typeof PortRange>;

export const DEFAULT_PORT_RANGE: PortRange = {
  start: 9224,
  end: 9323,
};
