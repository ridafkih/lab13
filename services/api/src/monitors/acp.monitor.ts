import { type AcpClient, envelopeToSandboxEvent } from "../acp/client";
import { extractTextFromEvent, isKnownEventType } from "../acp/event-parser";
import {
  publishInferenceStatus,
  publishSessionCompletion,
} from "../acp/publisher-adapter";
import { SessionMessagesProjector } from "../acp/session-messages";
import {
  extractTodoEvent,
  mapToReplaceTaskRows,
  mapToUpsertTaskRows,
} from "../acp/todo-tracker";
import { TIMING } from "../config/constants";
import { widelog } from "../logging";
import {
  getAgentEvents,
  getMaxSequence,
  storeAgentEvent,
} from "../repositories/agent-event.repository";
import {
  findRunningSessions,
  updateSessionFields,
} from "../repositories/session.repository";
import {
  findSessionTasks,
  replaceSessionTasks,
  upsertSessionTasks,
} from "../repositories/session-task.repository";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
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
  private activeAssistantPreview = "";
  private nextSequence: number | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private readonly messageProjector = new SessionMessagesProjector();
  private projectionInitialized = false;

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
        try {
          this.enqueuePersistence(envelope);
          const event = envelopeToSandboxEvent(envelope);
          if (event) {
            this.processEvent(event);
          }
        } catch (error) {
          widelog.context(() => {
            widelog.set("event_name", "acp.event_processing_failed");
            widelog.set("session_id", this.labSessionId);
            widelog.set("outcome", "error");
            widelog.errorFields(error);
            widelog.flush();
          });
        }
      }
    );
  }

  private enqueuePersistence(envelope: unknown): void {
    this.persistenceQueue = this.persistenceQueue
      .then(() => this.persistEnvelope(envelope))
      .catch((error) => {
        widelog.context(() => {
          widelog.set("event_name", "acp.event_persist_failed");
          widelog.set("session_id", this.labSessionId);
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          widelog.flush();
        });
      });
  }

  private async persistEnvelope(envelope: unknown): Promise<void> {
    await this.ensureProjectionInitialized();

    if (this.nextSequence === null) {
      this.nextSequence = (await getMaxSequence(this.labSessionId)) + 1;
    }
    const sequence = this.nextSequence;
    this.nextSequence += 1;

    await storeAgentEvent(this.labSessionId, sequence, envelope);
    this.messageProjector.applyEnvelope(envelope, sequence);

    const messageSnapshot = this.messageProjector.getSnapshot();
    this.getPublisher().publishSnapshot(
      "sessionMessages",
      { uuid: this.labSessionId },
      messageSnapshot
    );

    const lastMessage = this.messageProjector.getLastAssistantPreview();
    if (lastMessage) {
      await this.sessionStateStore.setLastMessage(
        this.labSessionId,
        lastMessage
      );
    }

    if (typeof envelope === "object" && envelope !== null) {
      this.getPublisher().publishEvent(
        "sessionAcpEvents",
        { uuid: this.labSessionId },
        {
          sequence,
          envelope: Object.fromEntries(Object.entries(envelope)),
        }
      );
    }

    const parsedTodoEvent = extractTodoEvent(envelope);
    if (!parsedTodoEvent) {
      return;
    }

    if (parsedTodoEvent.mode === "replace") {
      const taskRows = mapToReplaceTaskRows(parsedTodoEvent);
      await replaceSessionTasks(this.labSessionId, taskRows);
    } else {
      const taskRows = mapToUpsertTaskRows(parsedTodoEvent);
      await upsertSessionTasks(this.labSessionId, taskRows);
    }

    const snapshot = await findSessionTasks(this.labSessionId);
    this.getPublisher().publishSnapshot(
      "sessionTasks",
      { uuid: this.labSessionId },
      snapshot
    );
  }

  private async ensureProjectionInitialized(): Promise<void> {
    if (this.projectionInitialized) {
      return;
    }

    const events = await getAgentEvents(this.labSessionId);
    for (const event of events) {
      this.messageProjector.applyEnvelope(event.eventData, event.sequence);
    }

    const lastSequence = events.at(-1)?.sequence;
    this.nextSequence = typeof lastSequence === "number" ? lastSequence + 1 : 0;
    this.projectionInitialized = true;
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
    this.persistSessionState(
      this.sessionStateStore.setInferenceStatus(
        this.labSessionId,
        INFERENCE_STATUS.GENERATING
      ),
      "set_inference_status_generating"
    );

    if (event.type === "turn.started" || event.type === "item.started") {
      this.activeAssistantPreview = "";
    }

    const text = extractTextFromEvent(event as never);
    const lastMessage =
      event.type === "item.delta" && text
        ? this.appendAssistantPreview(text)
        : undefined;

    if (lastMessage) {
      this.persistSessionState(
        this.sessionStateStore.setLastMessage(this.labSessionId, lastMessage),
        "set_last_message"
      );
    }

    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.GENERATING,
      lastMessage
    );
  }

  private appendAssistantPreview(text: string): string {
    this.activeAssistantPreview += text;
    return this.activeAssistantPreview;
  }

  private handleTurnEnded(): void {
    this.activeAssistantPreview = "";
    this.persistSessionState(
      this.sessionStateStore.setInferenceStatus(
        this.labSessionId,
        INFERENCE_STATUS.IDLE
      ),
      "set_inference_status_idle"
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }

  private handleError(): void {
    this.persistSessionState(
      this.sessionStateStore.setInferenceStatus(
        this.labSessionId,
        INFERENCE_STATUS.IDLE
      ),
      "set_inference_status_error_idle"
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }

  private persistSessionState(
    operation: Promise<void>,
    operationName: string
  ): void {
    operation.catch((error) => {
      widelog.context(() => {
        widelog.set("event_name", "acp.session_state_persist_failed");
        widelog.set("session_id", this.labSessionId);
        widelog.set("operation", operationName);
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        widelog.flush();
      });
    });
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

  ensureSessionTracked(sessionId: string): void {
    if (this.trackers.has(sessionId)) {
      return;
    }

    this.trackers.set(
      sessionId,
      new SessionTracker(
        sessionId,
        this.acp,
        () => this.deferredPublisher.get(),
        this.completionTimerManager,
        this.sessionStateStore
      )
    );
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

    for (const { id, sandboxSessionId, workspaceDirectory } of active) {
      if (sandboxSessionId && !this.acp.hasSession(id)) {
        try {
          const resolvedWorkspaceDirectory =
            workspaceDirectory ?? (await resolveWorkspacePathBySession(id));
          const resumedSessionId = await this.acp.createSession(id, {
            cwd: resolvedWorkspaceDirectory,
            loadSessionId: sandboxSessionId,
          });

          if (resumedSessionId !== sandboxSessionId) {
            await updateSessionFields(id, {
              sandboxSessionId: resumedSessionId,
              workspaceDirectory: resolvedWorkspaceDirectory,
            });
          }
        } catch (error) {
          widelog.context(() => {
            widelog.set("event_name", "sandbox_agent_monitor.resume_failed");
            widelog.set("session_id", id);
            widelog.set("outcome", "error");
            widelog.errorFields(error);
            widelog.flush();
          });
        }
      }

      this.ensureSessionTracked(id);
    }
  }
}
