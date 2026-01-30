import type { BrowserSessionState, CurrentState, DesiredState, DaemonStatus, SessionSnapshot } from "./session";

export type DaemonEventType = "daemon:started" | "daemon:ready" | "daemon:stopped" | "daemon:error";

export interface DaemonEvent {
  type: DaemonEventType;
  sessionId: string;
  timestamp: number;
  data?: {
    port?: number;
    exitCode?: number;
    error?: string;
  };
}

export interface StateStoreOptions {
  streamPort?: number | null;
  errorMessage?: string | null;
  retryCount?: number;
  lastUrl?: string | null;
}

export interface StateStore {
  getState(sessionId: string): Promise<BrowserSessionState | null>;
  setState(state: BrowserSessionState): Promise<void>;
  setDesiredState(sessionId: string, desiredState: DesiredState): Promise<BrowserSessionState>;
  setCurrentState(
    sessionId: string,
    currentState: CurrentState,
    options?: StateStoreOptions,
  ): Promise<BrowserSessionState>;
  transitionState(
    sessionId: string,
    transition: (current: BrowserSessionState) => BrowserSessionState,
  ): Promise<BrowserSessionState>;
  getAllSessions(): Promise<BrowserSessionState[]>;
  deleteSession(sessionId: string): Promise<void>;
  updateHeartbeat(sessionId: string): Promise<void>;
  setLastUrl(sessionId: string, url: string | null): Promise<void>;
}

export interface DaemonController {
  start(sessionId: string, url?: string): Promise<{ port: number }>;
  stop(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<void>;
  getStatus(sessionId: string): Promise<DaemonStatus | null>;
  getCurrentUrl(sessionId: string): Promise<string | null>;
  launch(sessionId: string): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface ReconcilerConfig {
  maxRetries: number;
  getFirstExposedPort?: (sessionId: string) => Promise<number | null>;
}

export interface Reconciler {
  reconcileSession(session: BrowserSessionState): Promise<void>;
  reconcileAll(): Promise<void>;
}

export interface OrchestratorConfig {
  maxRetries: number;
  reconcileIntervalMs: number;
  cleanupDelayMs: number;
  getFirstExposedPort?: (sessionId: string) => Promise<number | null>;
}

export type StateChangeHandler = (sessionId: string, state: BrowserSessionState) => void;
export type ErrorHandler = (error: unknown) => void;

export interface Orchestrator {
  subscribe(sessionId: string): Promise<SessionSnapshot>;
  unsubscribe(sessionId: string): Promise<SessionSnapshot>;
  forceStop(sessionId: string): Promise<void>;
  getSnapshot(sessionId: string): Promise<SessionSnapshot>;
  getCachedFrame(sessionId: string): string | null;
  setCachedFrame(sessionId: string, frame: string): void;
  launchBrowser(sessionId: string): Promise<void>;
  startReconciler(): void;
  stopReconciler(): void;
  onStateChange(handler: StateChangeHandler): void;
  onError(handler: ErrorHandler): void;
  handleDaemonEvent(event: DaemonEvent): Promise<void>;
}

export interface SessionManager {
  getSubscriberCount(sessionId: string): number;
  incrementSubscribers(sessionId: string): number;
  decrementSubscribers(sessionId: string): number;
  setCleanupTimer(sessionId: string, callback: () => void, delayMs: number): void;
  clearCleanupTimer(sessionId: string): void;
  resetSession(sessionId: string): void;
  delete(sessionId: string): void;
  getFrame(sessionId: string): string | null;
  setFrame(sessionId: string, frame: string): void;
}
