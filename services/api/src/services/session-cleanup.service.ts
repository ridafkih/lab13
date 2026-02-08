import { findSessionContainersBySessionId } from "../repositories/container-session.repository";
import {
  deleteSession,
  findSessionById,
  updateSessionStatus,
} from "../repositories/session.repository";
import { SESSION_STATUS } from "../types/session";
import type { SessionStateStore } from "../state/session-state-store";
import type { BrowserService } from "../browser/browser-service";
import type { Sandbox, Publisher } from "../types/dependencies";
import type { ProxyManager } from "./proxy.service";
import { widelog } from "../logging";

interface ContainerCleanupResult {
  runtimeId: string;
  success: boolean;
  stillExists: boolean;
  error?: unknown;
}

export interface CleanupSessionDeps {
  sandbox: Sandbox;
  publisher: Publisher;
  proxyManager: ProxyManager;
  sessionStateStore: SessionStateStore;
  cleanupSessionNetwork: (sessionId: string) => Promise<void>;
}

export class SessionCleanupService {
  constructor(private readonly deps: CleanupSessionDeps) {}

  async cleanupSessionFull(sessionId: string, browserService: BrowserService): Promise<void> {
    return widelog.context(async () => {
      widelog.set("event_name", "session_cleanup.completed");
      widelog.set("session_id", sessionId);
      widelog.set("cleanup_type", "full");
      widelog.time.start("duration_ms");

      const { sandbox, publisher, proxyManager, cleanupSessionNetwork } = this.deps;

      try {
        const session = await findSessionById(sessionId);
        if (!session) return;

        await updateSessionStatus(sessionId, SESSION_STATUS.DELETING);

        publisher.publishDelta("sessions", {
          type: "remove",
          session: {
            id: session.id,
            projectId: session.projectId,
            title: session.title,
          },
        });

        const containers = await findSessionContainersBySessionId(sessionId);
        const runtimeIds = containers.filter((c) => c.runtimeId).map((c) => c.runtimeId);

        await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
        await browserService.forceStopBrowser(sessionId);

        try {
          await proxyManager.unregisterCluster(sessionId);
        } catch (error) {
          widelog.count("error_count");
          widelog.set(
            "errors.unregister_proxy_cluster",
            error instanceof Error ? error.message : String(error),
          );
        }

        try {
          await cleanupSessionNetwork(sessionId);
        } catch (error) {
          widelog.count("error_count");
          widelog.set(
            "errors.network_cleanup",
            error instanceof Error ? error.message : String(error),
          );
        }

        await deleteSession(sessionId);
        await this.deps.sessionStateStore.clear(sessionId);
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  async cleanupOrphanedResources(
    sessionId: string,
    runtimeIds: string[],
    browserService: BrowserService,
  ): Promise<void> {
    return widelog.context(async () => {
      widelog.set("event_name", "session_cleanup.completed");
      widelog.set("session_id", sessionId);
      widelog.set("cleanup_type", "orphaned");
      widelog.time.start("duration_ms");

      const { sandbox, proxyManager, cleanupSessionNetwork } = this.deps;

      try {
        await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
        await browserService.forceStopBrowser(sessionId);

        try {
          await proxyManager.unregisterCluster(sessionId);
        } catch (error) {
          widelog.count("error_count");
          widelog.set(
            "errors.unregister_proxy_cluster",
            error instanceof Error ? error.message : String(error),
          );
        }

        try {
          await cleanupSessionNetwork(sessionId);
        } catch (error) {
          widelog.count("error_count");
          widelog.set(
            "errors.network_cleanup",
            error instanceof Error ? error.message : String(error),
          );
        }

        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  async cleanupOnError(
    sessionId: string,
    projectId: string,
    runtimeIds: string[],
    browserService: BrowserService,
  ): Promise<void> {
    return widelog.context(async () => {
      widelog.set("event_name", "session_cleanup.completed");
      widelog.set("session_id", sessionId);
      widelog.set("cleanup_type", "error_path");
      widelog.time.start("duration_ms");

      const { sandbox, publisher, cleanupSessionNetwork } = this.deps;

      try {
        await updateSessionStatus(sessionId, "error");

        publisher.publishDelta("sessions", {
          type: "remove",
          session: { id: sessionId, projectId, title: null },
        });

        await this.stopAndRemoveContainers(runtimeIds, sandbox.provider, sessionId);
        await browserService.forceStopBrowser(sessionId);

        try {
          await cleanupSessionNetwork(sessionId);
        } catch (error) {
          widelog.count("error_count");
          widelog.set(
            "errors.network_cleanup",
            error instanceof Error ? error.message : String(error),
          );
        }

        await deleteSession(sessionId);
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  private async stopAndRemoveContainers(
    runtimeIds: string[],
    provider: Sandbox["provider"],
    sessionId: string,
  ): Promise<void> {
    const cleanupResults = await Promise.allSettled(
      runtimeIds.map(async (runtimeId) => {
        try {
          await provider.stopContainer(runtimeId);
          await provider.removeContainer(runtimeId);
          const stillExists = await provider.containerExists(runtimeId);
          return { runtimeId, success: !stillExists, stillExists };
        } catch (error) {
          return { runtimeId, success: false, stillExists: true, error };
        }
      }),
    );

    const fulfilledResults = cleanupResults
      .filter(
        (result): result is PromiseFulfilledResult<ContainerCleanupResult> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    for (const failure of fulfilledResults.filter((r) => !r.success)) {
      widelog.count("error_count");
      if (failure.error) {
        widelog.set(
          `errors.container_cleanup.${failure.runtimeId}`,
          failure.error instanceof Error ? failure.error.message : String(failure.error),
        );
      } else if (failure.stillExists) {
        widelog.set(
          `errors.container_still_exists.${failure.runtimeId}`,
          "container still exists after stop and remove",
        );
      }
    }
  }
}
