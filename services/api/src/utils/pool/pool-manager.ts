import { config } from "../../config/environment";
import {
  claimPooledSession as claimFromDb,
  countPooledSessions,
  createPooledSession as createInDb,
  findPooledSessions,
} from "../repositories/session.repository";
import { cleanupSession } from "../session/session-cleanup";
import { findAllProjects } from "../repositories/project.repository";
import {
  findContainersByProjectId,
  createSessionContainer,
} from "../repositories/container.repository";
import { initializeSessionContainers } from "../docker/containers";
import type { BrowserService } from "../browser/browser-service";
import type { Session } from "@lab/database/schema/sessions";

interface PoolStats {
  available: number;
  target: number;
}

let browserServiceRef: BrowserService | null = null;
const reconcileLocks = new Map<string, Promise<void>>();

export function setPoolBrowserService(browserService: BrowserService): void {
  browserServiceRef = browserService;
}

export function getTargetPoolSize(): number {
  return config.poolSize;
}

export async function getPoolStats(projectId: string): Promise<PoolStats> {
  const available = await countPooledSessions(projectId);
  return {
    available,
    target: getTargetPoolSize(),
  };
}

export async function claimPooledSession(projectId: string): Promise<Session | null> {
  if (getTargetPoolSize() === 0) {
    return null;
  }

  const session = await claimFromDb(projectId);

  if (session) {
    reconcilePool(projectId).catch((error) =>
      console.error(`Failed to reconcile pool for project ${projectId}:`, error),
    );
  }

  return session;
}

export async function createPooledSession(projectId: string): Promise<Session | null> {
  if (!browserServiceRef) {
    console.warn("Pool manager: Browser service not set, cannot create pooled session");
    return null;
  }

  const containerDefinitions = await findContainersByProjectId(projectId);
  if (containerDefinitions.length === 0) {
    return null;
  }

  const session = await createInDb(projectId);

  for (const containerDefinition of containerDefinitions) {
    await createSessionContainer({
      sessionId: session.id,
      containerId: containerDefinition.id,
      dockerId: "",
      status: "starting",
    });
  }

  try {
    await initializeSessionContainers(session.id, projectId, browserServiceRef);
    console.log(`Pool: Created pooled session ${session.id} for project ${projectId}`);
    return session;
  } catch (error) {
    console.error(`Pool: Failed to initialize pooled session ${session.id}:`, error);
    return null;
  }
}

async function doReconcile(projectId: string): Promise<void> {
  const targetSize = getTargetPoolSize();

  while (true) {
    const currentCount = await countPooledSessions(projectId);

    if (currentCount === targetSize) {
      break;
    }

    if (currentCount < targetSize) {
      console.log(
        `Pool: Adding session for project ${projectId} (current: ${currentCount}, target: ${targetSize})`,
      );
      await createPooledSession(projectId);
    } else {
      const excess = currentCount - targetSize;
      console.log(
        `Pool: Removing ${excess} session(s) for project ${projectId} (current: ${currentCount}, target: ${targetSize})`,
      );

      const sessionsToRemove = await findPooledSessions(projectId, excess);
      for (const session of sessionsToRemove) {
        if (!browserServiceRef) {
          console.warn("Pool manager: Browser service not set, cannot remove pooled session");
          break;
        }
        await cleanupSession(session.id, browserServiceRef);
        console.log(`Pool: Removed pooled session ${session.id}`);
      }
    }
  }
}

export async function reconcilePool(projectId: string): Promise<void> {
  const existing = reconcileLocks.get(projectId);
  if (existing) {
    return existing;
  }

  const promise = doReconcile(projectId).finally(() => {
    reconcileLocks.delete(projectId);
  });

  reconcileLocks.set(projectId, promise);
  return promise;
}

export async function reconcileAllPools(): Promise<void> {
  const projects = await findAllProjects();

  for (const project of projects) {
    try {
      await reconcilePool(project.id);
    } catch (error) {
      console.error(`Pool: Failed to reconcile pool for project ${project.id}:`, error);
    }
  }
}

export function initializePool(): void {
  console.log(`Pool: Initializing with target size ${getTargetPoolSize()}`);
  reconcileAllPools().catch((error) =>
    console.error("Pool: Initial reconciliation failed:", error),
  );
}
