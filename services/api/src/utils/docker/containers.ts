import { docker } from "../../clients/docker";
import { config } from "../../config/environment";
import { LABELS, VOLUMES } from "../../config/constants";
import {
  formatProjectName,
  formatContainerName,
  formatUniqueHostname,
  formatNetworkAlias,
} from "../../types/session";
import {
  findContainersWithDependencies,
  findPortsByContainerId,
  findEnvVarsByContainerId,
  updateSessionContainerDockerId,
  updateSessionContainersStatusBySessionId,
  type ContainerWithDependencies,
} from "../repositories/container.repository";
import {
  resolveStartOrder,
  CircularDependencyError,
  type ContainerNode,
} from "./dependency-resolver";
import {
  deleteSession,
  findSessionById,
  updateSessionStatus,
} from "../repositories/session.repository";
import { proxyManager, isProxyInitialized, ensureProxyInitialized } from "../proxy";
import { publisher } from "../../clients/publisher";
import type { BrowserService } from "../browser/browser-service";
import { createSessionNetwork, cleanupSessionNetwork } from "./network";
import { initializeContainerWorkspace } from "./workspace";

interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}

interface PreparedContainer {
  containerDefinition: ContainerWithDependencies;
  ports: { port: number }[];
  envVars: { key: string; value: string }[];
  containerWorkspace: string;
}

function buildContainerNodes(containers: ContainerWithDependencies[]): ContainerNode[] {
  return containers.map((container) => ({
    id: container.id,
    dependsOn: container.dependencies.map((dependency) => dependency.dependsOnContainerId),
  }));
}

async function prepareContainerData(
  sessionId: string,
  containerDefinition: ContainerWithDependencies,
): Promise<PreparedContainer> {
  const [ports, envVars, containerWorkspace] = await Promise.all([
    findPortsByContainerId(containerDefinition.id),
    findEnvVarsByContainerId(containerDefinition.id),
    initializeContainerWorkspace(sessionId, containerDefinition.id, containerDefinition.image),
  ]);

  return { containerDefinition, ports, envVars, containerWorkspace };
}

function buildEnvironmentVariables(
  sessionId: string,
  envVars: { key: string; value: string }[],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const envVar of envVars) {
    env[envVar.key] = envVar.value;
  }
  env.AGENT_BROWSER_SOCKET_DIR = VOLUMES.BROWSER_SOCKET_DIR;
  env.AGENT_BROWSER_SESSION = sessionId;

  return env;
}

function buildNetworkAliasesAndPortMap(
  sessionId: string,
  containerId: string,
  ports: { port: number }[],
): { portMap: Record<number, number>; networkAliases: string[] } {
  const portMap: Record<number, number> = {};
  const networkAliases: string[] = [];
  const uniqueHostname = formatUniqueHostname(sessionId, containerId);
  for (const { port } of ports) {
    portMap[port] = port;
    networkAliases.push(uniqueHostname);
    networkAliases.push(formatNetworkAlias(sessionId, port));
  }
  return { portMap, networkAliases };
}

async function createAndStartContainer(
  sessionId: string,
  projectId: string,
  networkName: string,
  prepared: PreparedContainer,
): Promise<{ dockerId: string; clusterContainer: ClusterContainer | null }> {
  const { containerDefinition, ports, envVars, containerWorkspace } = prepared;

  const env = buildEnvironmentVariables(sessionId, envVars);
  const serviceHostname = containerDefinition.hostname || containerDefinition.id;
  const uniqueHostname = formatUniqueHostname(sessionId, containerDefinition.id);
  const projectName = formatProjectName(sessionId);
  const containerName = formatContainerName(sessionId, containerDefinition.id);

  const containerVolumes = [
    { source: VOLUMES.WORKSPACES_HOST_PATH, target: "/workspaces" },
    { source: config.browserSocketVolume, target: VOLUMES.BROWSER_SOCKET_DIR },
  ];

  console.log(`[Container] Creating ${containerDefinition.image} for session ${sessionId}`);
  const dockerId = await docker.createContainer({
    name: containerName,
    image: containerDefinition.image,
    hostname: uniqueHostname,
    networkMode: networkName,
    workdir: containerWorkspace,
    env: Object.keys(env).length > 0 ? env : undefined,
    ports: ports.map(({ port }) => ({ container: port, host: undefined })),
    volumes: containerVolumes,
    labels: {
      "com.docker.compose.project": projectName,
      "com.docker.compose.service": serviceHostname,
      [LABELS.SESSION]: sessionId,
      [LABELS.PROJECT]: projectId,
      [LABELS.CONTAINER]: containerDefinition.id,
    },
    restartPolicy: {
      name: "on-failure",
      maximumRetryCount: 3,
    },
  });
  console.log(`[Container] Created ${dockerId}, updating database...`);

  await updateSessionContainerDockerId(sessionId, containerDefinition.id, dockerId);
  console.log(`[Container] Starting ${dockerId}...`);
  await docker.startContainer(dockerId);
  console.log(`[Container] Started ${dockerId}`);

  const { portMap, networkAliases } = buildNetworkAliasesAndPortMap(
    sessionId,
    containerDefinition.id,
    ports,
  );

  if (networkAliases.length > 0) {
    const isConnected = await docker.isConnectedToNetwork(dockerId, networkName);
    if (isConnected) {
      await docker.disconnectFromNetwork(dockerId, networkName);
    }
    await docker.connectToNetwork(dockerId, networkName, { aliases: networkAliases });

    const verifyConnected = await docker.isConnectedToNetwork(dockerId, networkName);
    if (!verifyConnected) {
      throw new Error(`Failed to connect container ${dockerId} to network ${networkName}`);
    }
  }

  const clusterContainer =
    Object.keys(portMap).length > 0
      ? { containerId: containerDefinition.id, hostname: uniqueHostname, ports: portMap }
      : null;

  return { dockerId, clusterContainer };
}

async function startContainersInLevel(
  sessionId: string,
  projectId: string,
  networkName: string,
  containerIds: string[],
  preparedByContainerId: Map<string, PreparedContainer>,
): Promise<{ dockerIds: string[]; clusterContainers: ClusterContainer[] }> {
  const levelDockerIds: string[] = [];
  const levelClusterContainers: ClusterContainer[] = [];

  const results = await Promise.all(
    containerIds.map((containerId) => {
      const prepared = preparedByContainerId.get(containerId);
      if (!prepared) {
        throw new Error(`Prepared container not found for ${containerId}`);
      }
      return createAndStartContainer(sessionId, projectId, networkName, prepared);
    }),
  );

  for (const result of results) {
    levelDockerIds.push(result.dockerId);
    if (result.clusterContainer) {
      levelClusterContainers.push(result.clusterContainer);
    }
  }

  return { dockerIds: levelDockerIds, clusterContainers: levelClusterContainers };
}

export async function initializeSessionContainers(
  sessionId: string,
  projectId: string,
  browserService: BrowserService,
): Promise<void> {
  const containerDefinitions = await findContainersWithDependencies(projectId);
  const dockerIds: string[] = [];
  const clusterContainers: ClusterContainer[] = [];

  let networkName: string;

  try {
    const containerNodes = buildContainerNodes(containerDefinitions);
    const startLevels = resolveStartOrder(containerNodes);

    networkName = await createSessionNetwork(sessionId);

    const preparedContainers = await Promise.all(
      containerDefinitions.map((containerDefinition) =>
        prepareContainerData(sessionId, containerDefinition),
      ),
    );

    const preparedByContainerId = new Map<string, PreparedContainer>();
    for (const prepared of preparedContainers) {
      preparedByContainerId.set(prepared.containerDefinition.id, prepared);
    }

    for (const level of startLevels) {
      const levelResult = await startContainersInLevel(
        sessionId,
        projectId,
        networkName,
        level.containerIds,
        preparedByContainerId,
      );
      dockerIds.push(...levelResult.dockerIds);
      clusterContainers.push(...levelResult.clusterContainers);
    }

    await ensureProxyInitialized();
    if (isProxyInitialized() && clusterContainers.length > 0) {
      await proxyManager.registerCluster(sessionId, networkName, clusterContainers);
    }

    const session = await findSessionById(sessionId);
    if (!session || session.status === "deleting") {
      console.log(`Session ${sessionId} was deleted during initialization, cleaning up`);
      await cleanupOrphanedContainers(sessionId, dockerIds, browserService);
      return;
    }
  } catch (error) {
    if (error instanceof CircularDependencyError) {
      console.error(`Circular dependency in project ${projectId}: ${error.cycle.join(" -> ")}`);
    }
    console.error(`Failed to initialize session ${sessionId}:`, error);
    await handleInitializationError(sessionId, projectId, dockerIds, browserService);
  }
}

async function stopAndRemoveContainer(dockerId: string, sessionId: string): Promise<void> {
  await docker.stopContainer(dockerId);
  await docker.removeContainer(dockerId);
}

function logContainerCleanupResults(
  results: PromiseSettledResult<void>[],
  dockerIds: string[],
  sessionId: string,
): void {
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[Container Cleanup] Failed to cleanup container dockerId=${dockerIds[index]} sessionId=${sessionId}:`,
        result.reason,
      );
    }
  });
}

async function cleanupOrphanedContainers(
  sessionId: string,
  dockerIds: string[],
  browserService: BrowserService,
): Promise<void> {
  const cleanupResults = await Promise.allSettled(
    dockerIds.map((dockerId) => stopAndRemoveContainer(dockerId, sessionId)),
  );

  logContainerCleanupResults(cleanupResults, dockerIds, sessionId);

  if (isProxyInitialized()) {
    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      console.warn(
        `[Container Cleanup] Failed to unregister proxy cluster sessionId=${sessionId}:`,
        error,
      );
    }
  }

  try {
    await cleanupSessionNetwork(sessionId);
  } catch (error) {
    console.error(`[Container Cleanup] Failed to cleanup network sessionId=${sessionId}:`, error);
  }

  await browserService.forceStopBrowser(sessionId);
}

async function handleInitializationError(
  sessionId: string,
  projectId: string,
  dockerIds: string[],
  browserService: BrowserService,
): Promise<void> {
  await updateSessionStatus(sessionId, "error");

  const errorContainers = await updateSessionContainersStatusBySessionId(sessionId, "error");

  for (const container of errorContainers) {
    publisher.publishDelta(
      "sessionContainers",
      { uuid: sessionId },
      { type: "update", container: { id: container.id, status: "error" } },
    );
  }

  const cleanupResults = await Promise.allSettled(
    dockerIds.map((dockerId) => stopAndRemoveContainer(dockerId, sessionId)),
  );

  logContainerCleanupResults(cleanupResults, dockerIds, sessionId);

  try {
    await cleanupSessionNetwork(sessionId);
  } catch (error) {
    console.error(
      `[Initialization Error] Failed to cleanup network sessionId=${sessionId}:`,
      error,
    );
  }

  await browserService.forceStopBrowser(sessionId);
  await deleteSession(sessionId);

  publisher.publishDelta("sessions", {
    type: "remove",
    session: { id: sessionId, projectId, title: null },
  });
}
