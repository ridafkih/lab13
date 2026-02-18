import { z } from "zod";
import { widelog } from "../../../logging";
import { parseRequestBody } from "../../../shared/validation";
import type { Handler, RouteContextFor } from "../../../types/route";

const ingestEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventId: z.number().int().nonnegative(),
  envelope: z.record(z.string(), z.unknown()),
});

type IngestContext = RouteContextFor<"infra" | "monitor">;

const POST: Handler<IngestContext> = async ({ request, context: ctx }) => {
  const body = await parseRequestBody(request, ingestEventSchema);

  widelog.set("session.id", body.sessionId);
  widelog.set("acp.event_id", body.eventId);
  widelog.set("route", "internal_acp_event_ingest");

  ctx.acpMonitor.ensureSessionTracked(body.sessionId);
  ctx.acp.emitEvent(body.sessionId, body.envelope as never);

  return Response.json({ ok: true }, { status: 202 });
};

export { POST };
