import { noContentResponse } from "@lab/http-utilities";
import { z } from "zod";
import { widelog } from "../../logging";
import { findSessionContainersBySessionId } from "../../repositories/container-session.repository";
import {
  findSessionByIdOrThrow,
  updateSessionFields,
} from "../../repositories/session.repository";
import { formatProxyUrl } from "../../shared/naming";
import { withParams } from "../../shared/route-helpers";
import { parseRequestBody } from "../../shared/validation";
import type { RouteContextFor } from "../../types/route";

const patchSessionSchema = z.object({
  sandboxSessionId: z.string().optional(),
  workspaceDirectory: z.string().optional(),
  title: z.string().optional(),
});

function buildContainerUrls(
  sessionId: string,
  ports: Record<string, number>,
  proxyBaseUrl: string
): string[] {
  return Object.keys(ports).map((containerPort) =>
    formatProxyUrl(sessionId, Number.parseInt(containerPort, 10), proxyBaseUrl)
  );
}

type SessionReadContext = RouteContextFor<"infra" | "proxy">;
type SessionCleanupContext = RouteContextFor<"session">;

const GET = withParams<{ sessionId: string }, SessionReadContext>(
  ["sessionId"],
  async ({ params: { sessionId }, context: ctx }) => {
    widelog.set("session.id", sessionId);
    const session = await findSessionByIdOrThrow(sessionId);

    const containers = await findSessionContainersBySessionId(sessionId);

    const containersWithStatus = await Promise.all(
      containers.map(async (container) => {
        if (!container.runtimeId) {
          return { ...container, info: null, urls: [] };
        }
        const info = await ctx.sandbox.provider.inspectContainer(
          container.runtimeId
        );
        const urls = info?.ports
          ? buildContainerUrls(sessionId, info.ports, ctx.proxyBaseUrl)
          : [];
        return { ...container, info, urls };
      })
    );

    widelog.set("session.container_count", containersWithStatus.length);
    return Response.json({ ...session, containers: containersWithStatus });
  }
);

const PATCH = withParams<{ sessionId: string }>(
  ["sessionId"],
  async ({ params: { sessionId }, request }) => {
    widelog.set("session.id", sessionId);
    await findSessionByIdOrThrow(sessionId);

    const body = await parseRequestBody(request, patchSessionSchema);
    const definedBodyKeys = Object.entries(body)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([fieldName]) => fieldName);
    widelog.set("session.updated_fields", definedBodyKeys.join(","));

    const updated = await updateSessionFields(sessionId, {
      sandboxSessionId: body.sandboxSessionId,
      workspaceDirectory: body.workspaceDirectory,
      title: body.title,
    });

    return Response.json(updated);
  }
);

const DELETE = withParams<{ sessionId: string }, SessionCleanupContext>(
  ["sessionId"],
  async ({ params: { sessionId }, context: ctx }) => {
    widelog.set("session.id", sessionId);
    await findSessionByIdOrThrow(sessionId);

    await ctx.sessionLifecycle.cleanupSession(sessionId);
    return noContentResponse();
  }
);

export { DELETE, GET, PATCH };
