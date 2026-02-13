import { db } from "@lab/database/client";
import { containerDependencies } from "@lab/database/schema/container-dependencies";
import { containerPorts } from "@lab/database/schema/container-ports";
import { type Container, containers } from "@lab/database/schema/containers";
import { and, eq } from "drizzle-orm";
import { InternalError } from "../shared/errors";

export function findContainersByProjectId(
  projectId: string
): Promise<Container[]> {
  return db
    .select()
    .from(containers)
    .where(eq(containers.projectId, projectId));
}

export async function getWorkspaceContainerIdByProjectId(
  projectId: string
): Promise<string | null> {
  const result = await db
    .select({ id: containers.id })
    .from(containers)
    .where(
      and(eq(containers.projectId, projectId), eq(containers.isWorkspace, true))
    )
    .limit(1);

  return result[0]?.id ?? null;
}

export function createContainerWithDetails(data: {
  projectId: string;
  image: string;
  hostname?: string;
  ports?: number[];
  dependencies?: { dependsOnContainerId: string; condition?: string }[];
}): Promise<Container> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: containers.id })
      .from(containers)
      .where(eq(containers.projectId, data.projectId))
      .limit(1);

    const isFirstContainer = existing.length === 0;

    const [container] = await tx
      .insert(containers)
      .values({
        projectId: data.projectId,
        image: data.image,
        hostname: data.hostname,
        isWorkspace: isFirstContainer,
      })
      .returning();
    if (!container) {
      throw new InternalError(
        "Failed to create container",
        "CONTAINER_CREATE_FAILED"
      );
    }

    if (data.ports && data.ports.length > 0) {
      await tx
        .insert(containerPorts)
        .values(
          data.ports.map((port) => ({ containerId: container.id, port }))
        );
    }

    if (data.dependencies && data.dependencies.length > 0) {
      await tx.insert(containerDependencies).values(
        data.dependencies.map((dep) => ({
          containerId: container.id,
          dependsOnContainerId: dep.dependsOnContainerId,
          condition: dep.condition || "service_started",
        }))
      );
    }

    return container;
  });
}
