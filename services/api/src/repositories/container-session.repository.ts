import { db } from "@lab/database/client";
import { containerPorts } from "@lab/database/schema/container-ports";
import { containers } from "@lab/database/schema/containers";
import {
  type SessionContainer,
  sessionContainers,
} from "@lab/database/schema/session-containers";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { groupBy } from "../shared/collection-utils";
import { InternalError } from "../shared/errors";
import { formatNetworkAlias } from "../shared/naming";
import { CONTAINER_STATUS, type ContainerStatus } from "../types/container";

interface SessionService {
  containerId: string;
  runtimeId: string | null;
  image: string;
  status: string;
  ports: number[];
}

export async function createSessionContainer(data: {
  sessionId: string;
  containerId: string;
  runtimeId?: string | null;
  status: string;
}): Promise<SessionContainer> {
  const [sessionContainer] = await db
    .insert(sessionContainers)
    .values(data)
    .returning();
  if (!sessionContainer) {
    throw new InternalError(
      "Failed to create session container",
      "SESSION_CONTAINER_CREATE_FAILED"
    );
  }
  return sessionContainer;
}

export function findSessionContainersBySessionId(
  sessionId: string
): Promise<SessionContainer[]> {
  return db
    .select()
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function findAllRunningSessionContainers(): Promise<
  {
    id: string;
    sessionId: string;
    runtimeId: string;
    hostname: string;
  }[]
> {
  const rows = await db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      runtimeId: sessionContainers.runtimeId,
      hostname: containers.hostname,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(
      and(
        eq(sessionContainers.status, CONTAINER_STATUS.RUNNING),
        isNotNull(sessionContainers.runtimeId)
      )
    );

  return rows.map((row) => {
    if (!row.runtimeId) {
      throw new Error("row.runtimeId was unexpectedly empty");
    }

    return {
      id: row.id,
      sessionId: row.sessionId,
      runtimeId: row.runtimeId,
      hostname: row.hostname ?? row.id,
    };
  });
}

export async function findAllActiveSessionContainers(): Promise<
  {
    id: string;
    sessionId: string;
    runtimeId: string;
    status: string;
  }[]
> {
  const rows = await db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      runtimeId: sessionContainers.runtimeId,
      status: sessionContainers.status,
    })
    .from(sessionContainers)
    .where(
      and(
        inArray(sessionContainers.status, [
          CONTAINER_STATUS.RUNNING,
          CONTAINER_STATUS.STARTING,
        ]),
        isNotNull(sessionContainers.runtimeId)
      )
    );

  return rows.flatMap((row) => {
    if (!row.runtimeId) {
      return [];
    }
    return [
      {
        id: row.id,
        sessionId: row.sessionId,
        runtimeId: row.runtimeId,
        status: row.status,
      },
    ];
  });
}

export async function findSessionContainerByRuntimeId(
  runtimeId: string
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.runtimeId, runtimeId));
  return row ?? null;
}

export async function findSessionContainerDetailsByRuntimeId(
  runtimeId: string
): Promise<{
  id: string;
  sessionId: string;
  containerId: string;
  hostname: string;
} | null> {
  const [row] = await db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      containerId: sessionContainers.containerId,
      hostname: containers.hostname,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.runtimeId, runtimeId));

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sessionId: row.sessionId,
    containerId: row.containerId,
    hostname: row.hostname ?? row.containerId,
  };
}

export async function updateSessionContainerRuntimeId(
  sessionId: string,
  containerId: string,
  runtimeId: string
): Promise<void> {
  await db
    .update(sessionContainers)
    .set({ runtimeId })
    .where(
      and(
        eq(sessionContainers.sessionId, sessionId),
        eq(sessionContainers.containerId, containerId)
      )
    );
}

export async function updateSessionContainerStatus(
  id: string,
  status: ContainerStatus
): Promise<void> {
  await db
    .update(sessionContainers)
    .set({ status })
    .where(eq(sessionContainers.id, id));
}

export async function updateSessionContainersStatusBySessionId(
  sessionId: string,
  status: ContainerStatus
): Promise<{ id: string }[]> {
  await db
    .update(sessionContainers)
    .set({ status })
    .where(eq(sessionContainers.sessionId, sessionId));

  return db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function getFirstExposedPort(
  sessionId: string
): Promise<number | null> {
  const result = await db
    .select({ port: containerPorts.port })
    .from(sessionContainers)
    .innerJoin(
      containerPorts,
      eq(containerPorts.containerId, sessionContainers.containerId)
    )
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  return result[0]?.port ?? null;
}

export async function getFirstExposedService(
  sessionId: string
): Promise<{ hostname: string; port: number } | null> {
  const result = await db
    .select({
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(
      containerPorts,
      eq(containerPorts.containerId, sessionContainers.containerId)
    )
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  const hostname = formatNetworkAlias(sessionId, result[0].port);
  return { hostname, port: result[0].port };
}

export function getSessionContainersWithDetails(sessionId: string): Promise<
  {
    id: string;
    containerId: string;
    status: string;
    hostname: string | null;
    image: string;
  }[]
> {
  return db
    .select({
      id: sessionContainers.id,
      containerId: sessionContainers.containerId,
      status: sessionContainers.status,
      hostname: containers.hostname,
      image: containers.image,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function getSessionServices(
  sessionId: string
): Promise<SessionService[]> {
  const containerRows = await db
    .select({
      containerId: sessionContainers.containerId,
      runtimeId: sessionContainers.runtimeId,
      status: sessionContainers.status,
      hostname: containers.hostname,
      image: containers.image,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.sessionId, sessionId));

  const containerIds = containerRows.map((row) => row.containerId);
  if (containerIds.length === 0) {
    return [];
  }

  const portRows = await db
    .select({
      containerId: containerPorts.containerId,
      port: containerPorts.port,
    })
    .from(containerPorts)
    .where(inArray(containerPorts.containerId, containerIds))
    .orderBy(asc(containerPorts.port));

  const portsByContainerId = groupBy(
    portRows,
    ({ containerId }) => containerId
  );

  return containerRows.map((row) => ({
    containerId: row.containerId,
    runtimeId: row.runtimeId,
    image: row.image,
    status: row.status,
    ports: (portsByContainerId.get(row.containerId) ?? []).map(
      ({ port }) => port
    ),
  }));
}

export async function getWorkspaceContainerId(
  sessionId: string
): Promise<string | null> {
  const result = await db
    .select({ containerId: sessionContainers.containerId })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(
      and(
        eq(sessionContainers.sessionId, sessionId),
        eq(containers.isWorkspace, true)
      )
    )
    .limit(1);

  return result[0]?.containerId ?? null;
}

export async function getWorkspaceContainerRuntimeId(
  sessionId: string
): Promise<{
  runtimeId: string | null;
  containerId: string;
} | null> {
  const result = await db
    .select({
      runtimeId: sessionContainers.runtimeId,
      containerId: sessionContainers.containerId,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(
      and(
        eq(sessionContainers.sessionId, sessionId),
        eq(containers.isWorkspace, true)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function setWorkspaceContainer(
  projectId: string,
  containerId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(containers)
      .set({ isWorkspace: false })
      .where(eq(containers.projectId, projectId));

    await tx
      .update(containers)
      .set({ isWorkspace: true })
      .where(
        and(eq(containers.id, containerId), eq(containers.projectId, projectId))
      );
  });
}

export async function clearWorkspaceContainer(
  projectId: string
): Promise<void> {
  await db
    .update(containers)
    .set({ isWorkspace: false })
    .where(eq(containers.projectId, projectId));
}
