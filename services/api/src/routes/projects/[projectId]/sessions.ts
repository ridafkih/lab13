import { db } from "@lab/database/client";
import { containers } from "@lab/database/schema/containers";
import { containerEnvVars } from "@lab/database/schema/container-env-vars";
import { containerPorts } from "@lab/database/schema/container-ports";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { eq } from "drizzle-orm";
import { DockerClient } from "@lab/sandbox-docker";
import { publisher } from "../../../index";

import type { RouteHandler } from "../../../utils/route-handler";

const docker = new DockerClient();

const GET: RouteHandler = async (_request, params) => {
  const projectSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, params.projectId));
  return Response.json(projectSessions);
};

const POST: RouteHandler = async (_request, params) => {
  const { projectId } = params;

  // Get container definitions for this project
  const containerDefs = await db
    .select()
    .from(containers)
    .where(eq(containers.projectId, projectId));

  if (containerDefs.length === 0) {
    return Response.json({ error: "Project has no container definitions" }, { status: 400 });
  }

  // Create session record
  const [session] = await db.insert(sessions).values({ projectId }).returning();

  const spawnedContainers = [];

  try {
    for (const containerDef of containerDefs) {
      // Get ports and env vars for this container
      const ports = await db
        .select()
        .from(containerPorts)
        .where(eq(containerPorts.containerId, containerDef.id));

      const envVars = await db
        .select()
        .from(containerEnvVars)
        .where(eq(containerEnvVars.containerId, containerDef.id));

      // Pull image if needed
      const imageExists = await docker.imageExists(containerDef.image);
      if (!imageExists) {
        await docker.pullImage(containerDef.image);
      }

      // Build env object
      const env: Record<string, string> = {};
      for (const envVar of envVars) {
        env[envVar.key] = envVar.value;
      }

      // Create and start the container
      const dockerId = await docker.createContainer({
        name: `lab-${session.id}-${containerDef.id}`,
        image: containerDef.image,
        hostname: containerDef.hostname ?? undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        ports: ports.map((p) => ({ container: p.port, host: undefined })),
        labels: {
          "com.docker.compose.project": `lab-${session.id}`,
          "com.docker.compose.service": containerDef.hostname ?? containerDef.id,
          "lab.session": session.id,
          "lab.project": projectId,
          "lab.container": containerDef.id,
        },
      });

      await docker.startContainer(dockerId);

      // Record the spawned container
      const [sessionContainer] = await db
        .insert(sessionContainers)
        .values({
          sessionId: session.id,
          containerId: containerDef.id,
          dockerId,
        })
        .returning();

      const info = await docker.inspectContainer(dockerId);
      spawnedContainers.push({
        ...sessionContainer,
        info,
      });
    }
  } catch (error) {
    await Promise.all(
      spawnedContainers.map(async (container) => {
        await docker.stopContainer(container.dockerId);
        await docker.removeContainer(container.dockerId);
      }),
    );
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw error;
  }

  publisher.publishDelta("sessions", {
    type: "add",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: `Session ${session.id.slice(0, 8)}`,
    },
  });

  return Response.json(
    {
      ...session,
      containers: spawnedContainers,
    },
    { status: 201 },
  );
};

export { GET, POST };
