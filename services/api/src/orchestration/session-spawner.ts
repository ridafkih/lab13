import type { Session } from "@lab/database/schema/sessions";
import { createSession } from "../repositories/session.repository";
import { findContainersByProjectId } from "../repositories/container-definition.repository";
import {
  createSessionContainer,
  getSessionContainersWithDetails,
} from "../repositories/container-session.repository";
import { findPortsByContainerId } from "../repositories/container-port.repository";
import { formatProxyUrl } from "../shared/naming";
import type { BrowserServiceManager } from "../managers/browser-service.manager";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import type { PoolManager } from "../managers/pool.manager";
import { generateSessionTitle } from "../generators/title.generator";
import type { Publisher } from "../types/dependencies";
import { CONTAINER_STATUS, isContainerStatus, type ContainerStatus } from "../types/container";
import { InternalError, ValidationError } from "../shared/errors";

export interface SpawnSessionOptions {
  projectId: string;
  taskSummary?: string;
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  publisher: Publisher;
  proxyBaseDomain?: string;
}

export interface SpawnSessionResult {
  session: Session;
  containers: Array<{
    id: string;
    name: string;
    status: ContainerStatus;
    urls: Array<{ port: number; url: string }>;
  }>;
}

type ContainerRow = SpawnSessionResult["containers"][number];

function validateContainerStatus(status: string): ContainerStatus {
  if (isContainerStatus(status)) {
    return status;
  }
  throw new ValidationError(`Invalid container status: ${status}`);
}

function extractContainerDisplayName(container: {
  hostname: string | null;
  image: string;
}): string {
  if (container.hostname) {
    return container.hostname;
  }
  const imageName = container.image.split("/").pop()?.split(":")[0];
  if (!imageName) {
    throw new InternalError(
      `Unable to extract display name from container image: ${container.image}`,
      "CONTAINER_NAME_EXTRACTION_FAILED",
    );
  }
  return imageName;
}

function publishSessionCreated(
  session: Session,
  containers: ContainerRow[],
  publisher: Publisher,
): void {
  publisher.publishDelta("sessions", {
    type: "add",
    session: { id: session.id, projectId: session.projectId, title: session.title },
  });
  publisher.publishSnapshot("sessionContainers", { uuid: session.id }, containers);
}

async function buildContainerUrls(
  sessionId: string,
  containerId: string,
  proxyBaseDomain?: string,
): Promise<Array<{ port: number; url: string }>> {
  if (!proxyBaseDomain) {
    return [];
  }

  const ports = await findPortsByContainerId(containerId);
  return ports.map(({ port }) => ({
    port,
    url: formatProxyUrl(sessionId, port, proxyBaseDomain),
  }));
}

function scheduleBackgroundWork(
  sessionId: string,
  projectId: string,
  sessionLifecycle: SessionLifecycleManager,
  poolManager: PoolManager,
  publisher: Publisher,
): void {
  sessionLifecycle.scheduleInitializeSession(sessionId, projectId).catch((error) => {
    console.error(`[Orchestration] Background initialization failed for ${sessionId}:`, error);
    publisher.publishDelta(
      "sessionMetadata",
      { uuid: sessionId },
      {
        initializationError:
          error instanceof Error ? `${error.name}: ${error.message}` : "Initialization failed",
      },
    );
  });
  poolManager.triggerReconcileInBackground(projectId, "session_spawn");
}

async function claimAndPreparePooledSession(
  projectId: string,
  poolManager: PoolManager,
  publisher: Publisher,
  proxyBaseDomain?: string,
): Promise<SpawnSessionResult | null> {
  const pooledSession = await poolManager.claimPooledSession(projectId);
  if (!pooledSession) {
    return null;
  }

  const existingContainers = await getSessionContainersWithDetails(pooledSession.id);
  const containers: ContainerRow[] = await Promise.all(
    existingContainers.map(async (container) => {
      const urls = await buildContainerUrls(
        pooledSession.id,
        container.containerId,
        proxyBaseDomain,
      );

      return {
        id: container.id,
        name: extractContainerDisplayName(container),
        status: validateContainerStatus(container.status),
        urls,
      };
    }),
  );

  publishSessionCreated(pooledSession, containers, publisher);
  return { session: pooledSession, containers };
}

async function createSessionWithContainers(
  projectId: string,
  publisher: Publisher,
  proxyBaseDomain?: string,
): Promise<SpawnSessionResult> {
  const containerDefinitions = await findContainersByProjectId(projectId);
  if (containerDefinitions.length === 0) {
    throw new ValidationError("Project has no container definitions");
  }

  const session = await createSession(projectId);
  const containers: ContainerRow[] = [];

  for (const definition of containerDefinitions) {
    const sessionContainer = await createSessionContainer({
      sessionId: session.id,
      containerId: definition.id,
      runtimeId: "",
      status: CONTAINER_STATUS.STARTING,
    });

    const urls = await buildContainerUrls(session.id, definition.id, proxyBaseDomain);

    containers.push({
      id: sessionContainer.id,
      name: extractContainerDisplayName(definition),
      status: CONTAINER_STATUS.STARTING,
      urls,
    });
  }

  publishSessionCreated(session, containers, publisher);
  return { session, containers };
}

export async function spawnSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {
  const { projectId, taskSummary, sessionLifecycle, poolManager, publisher, proxyBaseDomain } =
    options;

  const pooledResult = await claimAndPreparePooledSession(
    projectId,
    poolManager,
    publisher,
    proxyBaseDomain,
  );
  if (pooledResult) {
    scheduleBackgroundTitleGeneration(pooledResult.session.id, taskSummary, publisher);
    return pooledResult;
  }

  const result = await createSessionWithContainers(projectId, publisher, proxyBaseDomain);
  scheduleBackgroundWork(result.session.id, projectId, sessionLifecycle, poolManager, publisher);
  scheduleBackgroundTitleGeneration(result.session.id, taskSummary, publisher);
  return result;
}

function scheduleBackgroundTitleGeneration(
  sessionId: string,
  userMessage: string | undefined,
  publisher: Publisher,
): void {
  if (!userMessage?.trim()) {
    return;
  }

  generateSessionTitle({
    sessionId,
    userMessage,
    fallbackTitle: userMessage.slice(0, 50).trim(),
    publisher,
  }).catch((error) => {
    console.error(`[SessionSpawner] Title generation failed for ${sessionId}:`, error);
  });
}
