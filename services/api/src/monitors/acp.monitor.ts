import { type AcpClient, envelopeToSandboxEvent } from "../acp/client";
import { extractTextFromEvent, isKnownEventType } from "../acp/event-parser";
import {
  publishInferenceStatus,
  publishSessionCompletion,
} from "../acp/publisher-adapter";
import { TIMING } from "../config/constants";
import { widelog } from "../logging";
import { findRunningSessions } from "../repositories/session.repository";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import {
  INFERENCE_STATUS,
  type SessionStateStore,
} from "../state/session-state-store";
import type { AcpEvent, Publisher } from "../types/dependencies";

class CompletionTimerManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly completedSessions = new Set<string>();

  private readonly getPublisher: () => Publisher;

  constructor(getPublisher: () => Publisher) {
    this.getPublisher = getPublisher;
  }

  scheduleCompletion(sessionId: string): void {
    if (this.completedSessions.has(sessionId)) {
      return;
    }

    this.cancelCompletion(sessionId);

    const timer = setTimeout(() => {
      widelog.context(() => {
        widelog.set("event_name", "sandbox_agent_monitor.session_completion");
        widelog.set("session_id", sessionId);
        widelog.set("debounce_ms", TIMING.COMPLETION_DEBOUNCE_MS);

        this.timers.delete(sessionId);
        this.completedSessions.add(sessionId);
        publishSessionCompletion(this.getPublisher(), sessionId);

        widelog.flush();
      });
    }, TIMING.COMPLETION_DEBOUNCE_MS);

    this.timers.set(sessionId, timer);
  }

  cancelCompletion(sessionId: string): void {
    const existing = this.timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(sessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.cancelCompletion(sessionId);
    this.completedSessions.delete(sessionId);
  }
}

class SessionTracker {
  readonly labSessionId: string;
  private unsubscribe: (() => void) | null = null;
  private stopped = false;

  private readonly acp: AcpClient;
  private readonly getPublisher: () => Publisher;
  private readonly completionTimerManager: CompletionTimerManager;
  private readonly sessionStateStore: SessionStateStore;

  constructor(
    labSessionId: string,
    acp: AcpClient,
    getPublisher: () => Publisher,
    completionTimerManager: CompletionTimerManager,
    sessionStateStore: SessionStateStore
  ) {
    this.labSessionId = labSessionId;
    this.acp = acp;
    this.getPublisher = getPublisher;
    this.completionTimerManager = completionTimerManager;
    this.sessionStateStore = sessionStateStore;
    this.subscribe();
  }

  stop(): void {
    this.stopped = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.sessionStateStore.clear(this.labSessionId);
    this.completionTimerManager.clearSession(this.labSessionId);
  }

  get isActive(): boolean {
    return !this.stopped;
  }

  private subscribe(): void {
    if (this.stopped) {
      return;
    }

    this.unsubscribe = this.acp.onSessionEvent(
      this.labSessionId,
      (envelope) => {
        if (this.stopped) {
          return;
        }
        const event = envelopeToSandboxEvent(envelope);
        if (event) {
          this.processEvent(event);
        }
      }
    );
  }

  private processEvent(event: AcpEvent): void {
    if (!isKnownEventType(event.type)) {
      return;
    }

    switch (event.type) {
      case "turn.started":
      case "item.started":
      case "item.delta":
        this.handleActivity(event);
        break;

      case "turn.ended":
        this.handleTurnEnded();
        break;

      case "item.completed":
        break;

      case "error":
        this.handleError();
        break;

      default:
        break;
    }
  }

  private handleActivity(event: AcpEvent): void {
    this.completionTimerManager.cancelCompletion(this.labSessionId);
    this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.GENERATING
    );

    const text = extractTextFromEvent(event as never);

    if (text) {
      this.sessionStateStore.setLastMessage(this.labSessionId, text);
    }

    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.GENERATING,
      text ?? undefined
    );
  }

  private handleTurnEnded(): void {
    this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }

  private handleError(): void {
    this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }
}

export class AcpMonitor {
  private readonly trackers = new Map<string, SessionTracker>();
  private readonly abortController = new AbortController();
  private readonly completionTimerManager = new CompletionTimerManager(() =>
    this.deferredPublisher.get()
  );

  private readonly acp: AcpClient;
  private readonly deferredPublisher: DeferredPublisher;
  private readonly sessionStateStore: SessionStateStore;

  constructor(
    acp: AcpClient,
    deferredPublisher: DeferredPublisher,
    sessionStateStore: SessionStateStore
  ) {
    this.acp = acp;
    this.deferredPublisher = deferredPublisher;
    this.sessionStateStore = sessionStateStore;
  }

  async start(): Promise<void> {
    await widelog.context(async () => {
      widelog.set("event_name", "sandbox_agent_monitor.start");
      widelog.time.start("duration_ms");

      try {
        await this.syncSessions();
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });

    this.runSyncLoop();
  }

  stop(): void {
    this.abortController.abort();

    for (const tracker of this.trackers.values()) {
      tracker.stop();
    }
    this.trackers.clear();
  }

  private async runSyncLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      await new Promise((resolve) =>
        setTimeout(resolve, TIMING.SANDBOX_AGENT_SYNC_INTERVAL_MS)
      );
      if (this.abortController.signal.aborted) {
        return;
      }

      try {
        await this.syncSessions();
      } catch (error) {
        widelog.context(() => {
          widelog.set("event_name", "sandbox_agent_monitor.sync_failed");
          widelog.set("active_trackers", this.trackers.size);
          widelog.set(
            "sync_interval_ms",
            TIMING.SANDBOX_AGENT_SYNC_INTERVAL_MS
          );
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          widelog.flush();
        });
      }
    }
  }

  private async syncSessions(): Promise<void> {
    const active = await findRunningSessions();
    const activeIds = new Set(active.map((session) => session.id));

    for (const [id, tracker] of this.trackers) {
      if (!activeIds.has(id)) {
        tracker.stop();
        this.trackers.delete(id);
      }
    }

    for (const { id } of active) {
      if (!this.trackers.has(id)) {
        this.trackers.set(
          id,
          new SessionTracker(
            id,
            this.acp,
            () => this.deferredPublisher.get(),
            this.completionTimerManager,
            this.sessionStateStore
          )
        );
      }
    }
  }
}
