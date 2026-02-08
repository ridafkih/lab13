import { TIMING } from "../config/constants";
import { findRunningSessions, findSessionById } from "../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import { parseEvent, extractTextFromParts } from "../opencode/event-parser";
import {
  publishSessionDiff,
  publishInferenceStatus,
  publishSessionCompletion,
} from "../opencode/publisher-adapter";
import { INFERENCE_STATUS, type SessionStateStore } from "../state/session-state-store";
import type { OpencodeClient, Publisher } from "../types/dependencies";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import { logger } from "../logging";

class CompletionTimerManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly completedSessions = new Set<string>();

  constructor(private readonly getPublisher: () => Publisher) {}

  scheduleCompletion(sessionId: string): void {
    if (this.completedSessions.has(sessionId)) {
      return;
    }

    this.cancelCompletion(sessionId);

    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      this.completedSessions.add(sessionId);
      logger.info({
        event_name: "opencode_monitor.session_completion_scheduled",
        session_id: sessionId,
        debounce_ms: TIMING.COMPLETION_DEBOUNCE_MS,
      });
      publishSessionCompletion(this.getPublisher(), sessionId);
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
  private readonly abortController = new AbortController();

  constructor(
    readonly labSessionId: string,
    private readonly opencode: OpencodeClient,
    private readonly getPublisher: () => Publisher,
    private readonly completionTimerManager: CompletionTimerManager,
    private readonly sessionStateStore: SessionStateStore,
  ) {
    this.monitor();
  }

  stop(): void {
    this.abortController.abort();
    this.sessionStateStore.clear(this.labSessionId);
    this.completionTimerManager.clearSession(this.labSessionId);
  }

  get isActive(): boolean {
    return !this.abortController.signal.aborted;
  }

  private async syncInitialStatus(directory: string): Promise<void> {
    try {
      const session = await findSessionById(this.labSessionId);
      if (!session?.opencodeSessionId) return;

      const result = await this.opencode.session.status({ directory });
      if (!result.data) return;

      const status = result.data[session.opencodeSessionId];
      const inferenceStatus =
        status?.type === "busy" ? INFERENCE_STATUS.GENERATING : INFERENCE_STATUS.IDLE;

      await this.sessionStateStore.setInferenceStatus(this.labSessionId, inferenceStatus);
      publishInferenceStatus(this.getPublisher(), this.labSessionId, inferenceStatus);
    } catch (error) {
      logger.error({
        event_name: "opencode_monitor.sync_initial_status_failed",
        session_id: this.labSessionId,
        error,
      });
    }
  }

  private async monitor(): Promise<void> {
    const directory = await resolveWorkspacePathBySession(this.labSessionId);

    while (this.isActive) {
      await this.syncInitialStatus(directory);

      try {
        const { stream } = await this.opencode.event.subscribe(
          { directory },
          { signal: this.abortController.signal },
        );
        if (!stream) return;

        for await (const event of stream) {
          if (!this.isActive) break;
          await this.processEvent(event);
        }
      } catch (error) {
        if (!this.isActive) return;
        logger.error({
          event_name: "opencode_monitor.session_tracker_error",
          session_id: this.labSessionId,
          error,
        });
        await new Promise((resolve) => setTimeout(resolve, TIMING.OPENCODE_MONITOR_RETRY_MS));
      }
    }
  }

  private async processEvent(rawEvent: unknown): Promise<void> {
    const event = parseEvent(rawEvent);
    if (!event) return;

    switch (event.type) {
      case "session.diff":
        publishSessionDiff(this.getPublisher(), this.labSessionId, event);
        break;

      case "message.updated":
        await this.handleMessageUpdate(extractTextFromParts(event.properties.parts));
        break;

      case "message.part.updated":
        if (event.properties.part.type === "text" && event.properties.part.text) {
          await this.handleMessageUpdate(event.properties.part.text);
        }
        break;

      case "session.idle":
      case "session.error":
        await this.handleSessionInactive();
        break;
    }
  }

  private async handleMessageUpdate(text: string | null): Promise<void> {
    this.completionTimerManager.clearSession(this.labSessionId);
    await this.sessionStateStore.setInferenceStatus(this.labSessionId, INFERENCE_STATUS.GENERATING);
    if (text) {
      await this.sessionStateStore.setLastMessage(this.labSessionId, text);
    }
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.GENERATING,
      text ?? undefined,
    );
  }

  private async handleSessionInactive(): Promise<void> {
    await this.sessionStateStore.setInferenceStatus(this.labSessionId, INFERENCE_STATUS.IDLE);
    publishInferenceStatus(this.getPublisher(), this.labSessionId, INFERENCE_STATUS.IDLE);
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }
}

export class OpenCodeMonitor {
  private readonly trackers = new Map<string, SessionTracker>();
  private readonly abortController = new AbortController();
  private readonly completionTimerManager = new CompletionTimerManager(() =>
    this.deferredPublisher.get(),
  );

  constructor(
    private readonly opencode: OpencodeClient,
    private readonly deferredPublisher: DeferredPublisher,
    private readonly sessionStateStore: SessionStateStore,
  ) {}

  async start(): Promise<void> {
    logger.info({
      event_name: "opencode_monitor.start",
    });

    try {
      await this.syncSessions();
    } catch (error) {
      logger.error({
        event_name: "opencode_monitor.initial_sync_failed",
        error,
      });
    }

    this.runSyncLoop();
  }

  stop(): void {
    logger.info({
      event_name: "opencode_monitor.stop",
    });
    this.abortController.abort();

    for (const tracker of this.trackers.values()) {
      tracker.stop();
    }
    this.trackers.clear();
  }

  private async runSyncLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, TIMING.OPENCODE_SYNC_INTERVAL_MS));
      if (this.abortController.signal.aborted) return;

      try {
        await this.syncSessions();
      } catch (error) {
        logger.error({
          event_name: "opencode_monitor.sync_failed",
          error,
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
            this.opencode,
            () => this.deferredPublisher.get(),
            this.completionTimerManager,
            this.sessionStateStore,
          ),
        );
      }
    }
  }
}
