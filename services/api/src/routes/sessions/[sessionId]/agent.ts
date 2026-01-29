import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { containers } from "@lab/database/schema/containers";
import { containerPermissions } from "@lab/database/schema/container-permissions";
import { projects } from "@lab/database/schema/projects";
import { eq } from "drizzle-orm";

import type { RouteHandler } from "../../../utils/route-handler";
import { agentManager } from "../../../agent";
import { publisher } from "../../../index";

const GET: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const session = agentManager.getSession(sessionId);
  if (!session) {
    return Response.json({ active: false });
  }

  return Response.json({
    active: true,
    isProcessing: session.isActive,
    messages: session.getMessages(),
  });
};

const POST: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  if (agentManager.hasSession(sessionId)) {
    return Response.json({ error: "Agent already started for this session" }, { status: 409 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, session.projectId));
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const sessionContainerRows = await db
    .select()
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));

  const agentContainers = await Promise.all(
    sessionContainerRows.map(async (sc) => {
      const [container] = await db
        .select()
        .from(containers)
        .where(eq(containers.id, sc.containerId));

      const [perms] = await db
        .select()
        .from(containerPermissions)
        .where(eq(containerPermissions.containerId, sc.containerId));

      return {
        id: sc.id,
        containerId: sc.containerId,
        dockerId: sc.dockerId,
        hostname: container?.hostname ?? undefined,
        permissions: perms?.permissions ?? [],
      };
    }),
  );

  const agentSession = agentManager.createSession({
    sessionId,
    projectId: session.projectId,
    systemPrompt: project.systemPrompt ?? undefined,
    containers: agentContainers,
  });

  agentSession.on("token", (content) => {
    publisher.publishEvent("sessionStream", { uuid: sessionId }, { type: "token", content });
  });

  agentSession.on("message", (message) => {
    publisher.publishDelta("sessionMessages", { uuid: sessionId }, { type: "append", message });
  });

  agentSession.on("toolStart", (tool) => {
    publisher.publishDelta("sessionAgentTools", { uuid: sessionId }, { type: "add", tool });
  });

  agentSession.on("toolEnd", (tool) => {
    publisher.publishDelta("sessionAgentTools", { uuid: sessionId }, { type: "update", tool });
  });

  agentSession.on("complete", () => {
    publisher.publishEvent("sessionStream", { uuid: sessionId }, { type: "complete" });
  });

  agentSession.on("error", (error) => {
    publisher.publishEvent(
      "sessionStream",
      { uuid: sessionId },
      {
        type: "error",
        content: error.message,
      },
    );
  });

  return Response.json({ started: true }, { status: 201 });
};

const DELETE: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const destroyed = agentManager.destroySession(sessionId);
  if (!destroyed) {
    return Response.json({ error: "No agent session found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
};

export { DELETE, GET, POST };
