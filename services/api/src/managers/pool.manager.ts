import type { Session } from "@lab/database/schema/sessions";
import { TIMING } from "../config/constants";
import { widelog } from "../logging";
import { findContainersByProjectId } from "../repositories/container-definition.repository";
import { createSessionContainer } from "../repositories/container-session.repository";
import {
  claimPooledSession as claimFromDb,
  countPooledSessions,
  createPooledSession as createInDb,
  findPooledSessions,
} from "../repositories/pool.repository";
import { findAllProjects } from "../repositories/project.repository";
import { CONTAINER_STATUS } from "../types/container";
import type { BrowserServiceManager } from "./browser-service.manager";
import type { SessionLifecycleManager } from "./session-lifecycle.manager";

interface PoolStats {
  available: number;
  target: number;
}

/**
 * Computes exponential backoff duration with a ceiling.
 */
function computeBackoffMs(
  failures: number,
  baseMs: number,
  maxMs: number
): number {
  return Math.min(baseMs * 2 ** failures, maxMs);
}

/**
 * Manages a pool of pre-warmed sessions for each project, converging toward a target size.
 * Reconciliation is serialized per-project via reconcileLocks to prevent concurrent fill/drain
 * operations from racing against each other.
 */
export class PoolManager {
  private readonly reconcileLocks = new Map<string, Promise<void>>();
  private readonly reconcileStartedAt = new Map<string, number>();

  private readonly poolSize: number;
  private readonly browserService: BrowserServiceManager;
  private readonly sessionLifecycle: SessionLifecycleManager;

  constructor(
    poolSize: number,
    browserService: BrowserServiceManager,
    sessionLifecycle: SessionLifecycleManager
  ) {
    this.poolSize = poolSize;
    this.browserService = browserService;
    this.sessionLifecycle = sessionLifecycle;
  }

  getTargetPoolSize(): number {
    return this.poolSize;
  }

  async getPoolStats(projectId: string): Promise<PoolStats> {
    const available = await countPooledSessions(projectId);
    return {
      available,
      target: this.getTargetPoolSize(),
    };
  }

  async claimPooledSession(projectId: string): Promise<Session | null> {
    if (this.getTargetPoolSize() === 0) {
      return null;
    }

    const session = await claimFromDb(projectId);

    if (session) {
      this.triggerReconcileInBackground(projectId);
    }

    return session;
  }

  triggerReconcileInBackground(projectId: string): void {
    this.reconcilePool(projectId).catch(() => {
      /* expected */
    });
  }

  createPooledSession(projectId: string): Promise<Session | null> {
    return widelog.context(async () => {
      widelog.set(
        "event_name",
        "pool_manager.initialize_pooled_session.completed"
      );
      widelog.set("project_id", projectId);
      widelog.time.start("duration_ms");
      let warmed = false;

      try {
        const containerDefinitions = await findContainersByProjectId(projectId);
        if (containerDefinitions.length === 0) {
          return null;
        }

        const session = await createInDb(projectId);
        widelog.set("session_id", session.id);

        await Promise.all(
          containerDefinitions.map((containerDefinition) =>
            createSessionContainer({
              sessionId: session.id,
              containerId: containerDefinition.id,
              status: CONTAINER_STATUS.STARTING,
            })
          )
        );

        await this.sessionLifecycle.initializeSession(session.id, projectId);

        try {
          await this.browserService.service.warmUpBrowser(session.id);
          warmed = true;
        } catch {
          warmed = false;
        }

        widelog.set("warmed", warmed);
        widelog.set("outcome", "success");
        return session;
      } catch (error) {
        widelog.set("warmed", warmed);
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        return null;
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  reconcilePool(projectId: string): Promise<void> {
    const existing = this.reconcileLocks.get(projectId);
    if (existing) {
      return existing;
    }

    const promise = Promise.race([
      this.doReconcile(projectId),
      new Promise<void>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Pool reconciliation timeout for project ${projectId}`)
            ),
          TIMING.POOL_RECONCILIATION_TIMEOUT_MS
        )
      ),
    ]).finally(() => {
      this.reconcileLocks.delete(projectId);
      this.reconcileStartedAt.delete(projectId);
    });

    this.reconcileStartedAt.set(projectId, Date.now());
    this.reconcileLocks.set(projectId, promise);
    return promise;
  }

  async reconcileAllPools(): Promise<void> {
    const projects = await findAllProjects();

    for (const project of projects) {
      try {
        await this.reconcilePool(project.id);
      } catch {
        // Errors are captured in doReconcile's wide event context
      }
    }
  }

  initialize(): void {
    this.reconcileAllPools().catch(() => {
      /* expected */
    });
  }

  /**
   * Attempts to create one pooled session. Returns the updated consecutive failure count.
   * On success, resets failures to 0. On failure, increments and applies backoff delay.
   */
  private async fillOne(
    projectId: string,
    consecutiveFailures: number
  ): Promise<number> {
    const session = await this.createPooledSession(projectId);
    if (!session) {
      const failures = consecutiveFailures + 1;
      const delay = computeBackoffMs(
        failures,
        TIMING.POOL_BACKOFF_BASE_MS,
        TIMING.POOL_BACKOFF_MAX_MS
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return failures;
    }
    return 0;
  }

  /**
   * Removes excess pooled sessions beyond the target size.
   */
  private async drainExcess(
    projectId: string,
    excess: number
  ): Promise<number> {
    const sessionsToRemove = await findPooledSessions(projectId, excess);
    for (const session of sessionsToRemove) {
      await this.sessionLifecycle.cleanupSession(session.id);
    }
    return sessionsToRemove.length;
  }

  /**
   * Converges the pool toward the target size for a given project.
   * Uses a fill/drain loop with exponential backoff on creation failures.
   * Protected by a per-project lock in reconcilePool() to prevent concurrent reconciliation.
   */
  private doReconcile(projectId: string): Promise<void> {
    return widelog.context(async () => {
      widelog.set("event_name", "pool_manager.reconcile_pool.completed");
      widelog.set("project_id", projectId);
      widelog.time.start("duration_ms");

      const targetSize = this.getTargetPoolSize();
      widelog.set("target_size", targetSize);
      const maxIterations = Math.max(10, targetSize * 2);
      let consecutiveFailures = 0;
      let settled = false;
      let sessionsCreated = 0;
      let sessionsDrained = 0;
      let currentSize = 0;

      try {
        for (
          let iterationIndex = 0;
          iterationIndex < maxIterations;
          iterationIndex++
        ) {
          currentSize = await countPooledSessions(projectId);

          if (currentSize === targetSize) {
            settled = true;
            break;
          }

          if (currentSize < targetSize) {
            consecutiveFailures = await this.fillOne(
              projectId,
              consecutiveFailures
            );
            if (consecutiveFailures === 0) {
              sessionsCreated++;
            } else {
              widelog.count("error_count");
              widelog.set(
                `errors.fill_attempt_${iterationIndex}`,
                `creation failed, consecutive_failures=${consecutiveFailures}`
              );
            }
          } else {
            const drained = await this.drainExcess(
              projectId,
              currentSize - targetSize
            );
            sessionsDrained += drained;
          }
        }

        if (!settled) {
          widelog.count("error_count");
          widelog.set(
            "errors.iteration_limit",
            `reached max_iterations=${maxIterations}`
          );
        }

        widelog.set("outcome", settled ? "success" : "completed_with_errors");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.set("current_size", currentSize);
        widelog.set("sessions_created", sessionsCreated);
        widelog.set("sessions_drained", sessionsDrained);
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }
}
