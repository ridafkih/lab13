import { db } from "@lab/database/client";
import { containers } from "@lab/database/schema/containers";
import { containerEnvVars } from "@lab/database/schema/container-env-vars";
import { containerPorts } from "@lab/database/schema/container-ports";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { eq } from "drizzle-orm";
import { DockerClient } from "@lab/sandbox-docker";
import { proxyManager, isProxyInitialized, ensureProxyInitialized } from "../../../proxy";

import type { RouteHandler } from "../../../utils/route-handler";
import { publisher } from "../../../publisher";

const docker = new DockerClient();
const WORKSPACES_VOLUME = "lab_session_workspaces";
const WORKSPACES_HOST_PATH = "/var/lib/docker/volumes/lab_session_workspaces/_data";

interface ContainerResult {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  urls: { port: number; url: string }[];
}

const GET: RouteHandler = async (_request, params) => {
  const projectSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, params.projectId));
  return Response.json(projectSessions);
};

const POST: RouteHandler = async (_request, params) => {
  const { projectId } = params;

  const containerDefinitioninitions = await db
    .select()
    .from(containers)
    .where(eq(containers.projectId, projectId));

  if (containerDefinitioninitions.length === 0) {
    return Response.json({ error: "Project has no container definitions" }, { status: 400 });
  }

  const [session] = await db.insert(sessions).values({ projectId }).returning();

  const networkName = `lab-${session.id}`;
  const dockerIds: string[] = [];
  const spawnedContainers: ContainerResult[] = [];
  const clusterContainers: {
    containerId: string;
    hostname: string;
    ports: Record<number, number>;
  }[] = [];

  try {
    await docker.createNetwork(networkName, { labels: { "lab.session": session.id } });

    for (const containerDefinition of containerDefinitioninitions) {
      const ports = await db
        .select()
        .from(containerPorts)
        .where(eq(containerPorts.containerId, containerDefinition.id));

      const envVars = await db
        .select()
        .from(containerEnvVars)
        .where(eq(containerEnvVars.containerId, containerDefinition.id));

      const imageExists = await docker.imageExists(containerDefinition.image);
      if (!imageExists) {
        await docker.pullImage(containerDefinition.image);
      }

      const { workdir: imageWorkdir } = await docker.getImageConfig(containerDefinition.image);
      const containerWorkspace = `/workspaces/${session.id}/${containerDefinition.id}`;

      const initCommand =
        imageWorkdir && imageWorkdir !== "/"
          ? `mkdir -p ${containerWorkspace} && cp -r ${imageWorkdir}/. ${containerWorkspace}/`
          : `mkdir -p ${containerWorkspace}`;

      const initId = await docker.createContainer({
        image: containerDefinition.image,
        command: ["sh", "-c", initCommand],
        volumes: [{ source: WORKSPACES_VOLUME, target: "/workspaces" }],
      });
      await docker.startContainer(initId);
      await docker.waitContainer(initId);
      await docker.removeContainer(initId);

      const env: Record<string, string> = {};
      for (const envVar of envVars) {
        env[envVar.key] = envVar.value;
      }

      const serviceHostname = containerDefinition.hostname ?? containerDefinition.id;
      const uniqueHostname = `s-${session.id.slice(0, 8)}-${containerDefinition.id.slice(0, 8)}`;

      const projectName = `lab-${session.id}`;
      const containerName = `${projectName}-${containerDefinition.id}`;

      const dockerId = await docker.createContainer({
        name: containerName,
        image: containerDefinition.image,
        hostname: uniqueHostname,
        networkMode: networkName,
        workdir: containerWorkspace,
        env: Object.keys(env).length > 0 ? env : undefined,
        ports: ports.map(({ port }) => ({ container: port, host: undefined })),
        volumes: [{ source: WORKSPACES_HOST_PATH, target: "/workspaces" }],
        labels: {
          "com.docker.compose.project": projectName,
          "com.docker.compose.service": serviceHostname,
          "lab.session": session.id,
          "lab.project": projectId,
          "lab.container": containerDefinition.id,
        },
      });

      dockerIds.push(dockerId);
      await docker.startContainer(dockerId);

      const [sessionContainer] = await db
        .insert(sessionContainers)
        .values({
          sessionId: session.id,
          containerId: containerDefinition.id,
          dockerId,
        })
        .returning();

      const displayName =
        containerDefinition.hostname ??
        containerDefinition.image.split("/").pop()?.split(":")[0] ??
        "container";

      const portMap: Record<number, number> = {};
      for (const { port } of ports) {
        portMap[port] = port;
      }

      if (Object.keys(portMap).length > 0) {
        clusterContainers.push({
          containerId: containerDefinition.id,
          hostname: uniqueHostname,
          ports: portMap,
        });
      }

      spawnedContainers.push({
        id: sessionContainer.id,
        name: displayName,
        status: "running",
        urls: [],
      });
    }

    await ensureProxyInitialized();
    if (isProxyInitialized() && clusterContainers.length > 0) {
      const routes = await proxyManager.registerCluster(session.id, networkName, clusterContainers);

      if (spawnedContainers[0] && routes.length > 0) {
        spawnedContainers[0].urls = routes.map((route) => ({
          port: route.containerPort,
          url: route.url,
        }));
      }
    }
  } catch (error) {
    await Promise.all(
      dockerIds.map(async (dockerId) => {
        await docker.stopContainer(dockerId);
        await docker.removeContainer(dockerId);
      }),
    );
    await docker.removeNetwork(networkName);
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw error;
  }

  publisher.publishDelta("sessions", {
    type: "add",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: `${session.id.slice(0, 8)}`,
    },
  });

  publisher.publishSnapshot("sessionContainers", { uuid: session.id }, spawnedContainers);

  return Response.json(
    {
      id: session.id,
      projectId: session.projectId,
      containers: spawnedContainers,
    },
    { status: 201 },
  );
};

export { GET, POST };
