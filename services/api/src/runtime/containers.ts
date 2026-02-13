import { CircularDependencyError, resolveStartOrder } from "@lab/sandbox-sdk";
import type { BrowserService } from "../browser/browser-service";
import { widelog } from "../logging";
import { findContainersWithDependencies } from "../repositories/container-dependency.repository";
import {
  findSessionContainerByRuntimeId,
  updateSessionContainerRuntimeId,
  updateSessionContainerStatus,
  updateSessionContainersStatusBySessionId,
} from "../repositories/container-session.repository";
import { findSessionById } from "../repositories/session.repository";
import type { ProxyManager } from "../services/proxy.service";
import type { SessionCleanupService } from "../services/session-cleanup.service";
import { InternalError } from "../shared/errors";
import { formatUniqueHostname } from "../shared/naming";
import { CONTAINER_STATUS } from "../types/container";
import type { Publisher, Sandbox } from "../types/dependencies";
import { SESSION_STATUS } from "../types/session";
import {
  buildContainerNodes,
  type PreparedContainer,
  prepareAllContainerData,
} from "./container-preparer";
import { buildEnvironmentVariables } from "./environment-builder";
import { createSessionNetwork } from "./network";
import { buildNetworkAliasesAndPortMap } from "./port-mapper";

interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}

interface InitializeSessionContainersDeps {
  sandbox: Sandbox;
  publisher: Publisher;
  proxyManager: ProxyManager;
  cleanupService: SessionCleanupService;
}

async function createAndStartContainer(
  sessionId: string,
  projectId: string,
  networkId: string,
  prepared: PreparedContainer,
  deps: Pick<InitializeSessionContainersDeps, "sandbox" | "publisher">
): Promise<{ runtimeId: string; clusterContainer: ClusterContainer | null }> {
  const { containerDefinition, ports, envVars, containerWorkspace } = prepared;
  const { sandbox, publisher } = deps;

  const env = buildEnvironmentVariables(sessionId, envVars);
  const uniqueHostname = formatUniqueHostname(
    sessionId,
    containerDefinition.id
  );
  const { portMap, networkAliases } = buildNetworkAliasesAndPortMap(
    sessionId,
    containerDefinition.id,
    ports
  );

  const { runtimeId } = await sandbox.runtime.startContainer({
    sessionId,
    projectId,
    containerId: containerDefinition.id,
    image: containerDefinition.image,
    networkId,
    hostname: uniqueHostname,
    workdir: containerWorkspace,
    env: Object.keys(env).length > 0 ? env : undefined,
    ports: ports.map(({ port }) => port),
    aliases: networkAliases,
  });

  await updateSessionContainerRuntimeId(
    sessionId,
    containerDefinition.id,
    runtimeId
  );
  const sessionContainer = await findSessionContainerByRuntimeId(runtimeId);
  if (sessionContainer) {
    await updateSessionContainerStatus(
      sessionContainer.id,
      CONTAINER_STATUS.RUNNING
    );
    publisher.publishDelta(
      "sessionContainers",
      { uuid: sessionId },
      {
        type: "update",
        container: {
          id: sessionContainer.id,
          status: CONTAINER_STATUS.RUNNING,
        },
      }
    );
  }

  const clusterContainer =
    Object.keys(portMap).length > 0
      ? {
          containerId: containerDefinition.id,
          hostname: uniqueHostname,
          ports: portMap,
        }
      : null;

  return { runtimeId, clusterContainer };
}

async function startContainersInLevel(
  sessionId: string,
  projectId: string,
  networkId: string,
  containerIds: string[],
  preparedByContainerId: Map<string, PreparedContainer>,
  deps: Pick<InitializeSessionContainersDeps, "sandbox" | "publisher">
): Promise<{ runtimeIds: string[]; clusterContainers: ClusterContainer[] }> {
  const levelRuntimeIds: string[] = [];
  const levelClusterContainers: ClusterContainer[] = [];

  const results = await Promise.all(
    containerIds.map((containerId) => {
      const prepared = preparedByContainerId.get(containerId);
      if (!prepared) {
        throw new InternalError(
          `Prepared container not found for ${containerId}`,
          "PREPARED_CONTAINER_NOT_FOUND"
        );
      }
      return createAndStartContainer(
        sessionId,
        projectId,
        networkId,
        prepared,
        deps
      );
    })
  );

  for (const result of results) {
    levelRuntimeIds.push(result.runtimeId);
    if (result.clusterContainer) {
      levelClusterContainers.push(result.clusterContainer);
    }
  }

  return {
    runtimeIds: levelRuntimeIds,
    clusterContainers: levelClusterContainers,
  };
}

export function initializeSessionContainers(
  sessionId: string,
  projectId: string,
  browserService: BrowserService,
  deps: InitializeSessionContainersDeps
): Promise<void> {
  return widelog.context(async () => {
    widelog.set("event_name", "runtime.session_initialization.completed");
    widelog.set("session_id", sessionId);
    widelog.set("project_id", projectId);
    widelog.time.start("duration_ms");

    const { sandbox, proxyManager, cleanupService } = deps;
    const containerDefinitions =
      await findContainersWithDependencies(projectId);
    const runtimeIds: string[] = [];
    const clusterContainers: ClusterContainer[] = [];

    try {
      const containerNodes = buildContainerNodes(containerDefinitions);
      const startLevels = resolveStartOrder(containerNodes);

      const networkId = await createSessionNetwork(sessionId, sandbox);

      const preparedContainers = await prepareAllContainerData(
        sessionId,
        containerDefinitions,
        sandbox
      );

      const preparedByContainerId = new Map<string, PreparedContainer>();
      for (const prepared of preparedContainers) {
        preparedByContainerId.set(prepared.containerDefinition.id, prepared);
      }

      for (const level of startLevels) {
        const levelResult = await startContainersInLevel(
          sessionId,
          projectId,
          networkId,
          level.containerIds,
          preparedByContainerId,
          deps
        );
        runtimeIds.push(...levelResult.runtimeIds);
        clusterContainers.push(...levelResult.clusterContainers);
      }

      if (clusterContainers.length > 0) {
        await proxyManager.registerCluster(sessionId, clusterContainers);
      }

      const session = await findSessionById(sessionId);
      if (!session || session.status === SESSION_STATUS.DELETING) {
        widelog.set("outcome", "deleted_during_setup");
        await cleanupService.cleanupOrphanedResources(
          sessionId,
          runtimeIds,
          browserService
        );
        return;
      }

      widelog.set("outcome", "success");
    } catch (error) {
      widelog.set("outcome", "error");
      widelog.errorFields(error);
      if (error instanceof CircularDependencyError) {
        widelog.set("circular_dependency", error.cycle.join(" -> "));
      }
      await handleInitializationError(
        sessionId,
        projectId,
        runtimeIds,
        browserService,
        deps
      );
    } finally {
      widelog.set("containers_created", runtimeIds.length);
      widelog.time.stop("duration_ms");
      widelog.flush();
    }
  });
}

async function handleInitializationError(
  sessionId: string,
  projectId: string,
  runtimeIds: string[],
  browserService: BrowserService,
  deps: Pick<InitializeSessionContainersDeps, "publisher" | "cleanupService">
): Promise<void> {
  const errorContainers = await updateSessionContainersStatusBySessionId(
    sessionId,
    CONTAINER_STATUS.ERROR
  );

  for (const container of errorContainers) {
    deps.publisher.publishDelta(
      "sessionContainers",
      { uuid: sessionId },
      {
        type: "update",
        container: { id: container.id, status: CONTAINER_STATUS.ERROR },
      }
    );
  }

  await deps.cleanupService.cleanupOnError(
    sessionId,
    projectId,
    runtimeIds,
    browserService
  );
}
