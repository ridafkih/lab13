import { db } from "@lab/database/client";
import { agentEvents } from "@lab/database/schema/agent-events";
import { and, eq, gt, max } from "drizzle-orm";

export async function storeAgentEvent(
  sessionId: string,
  sequence: number,
  eventData: unknown
): Promise<void> {
  await db.insert(agentEvents).values({ sessionId, sequence, eventData });
}

export async function getMaxSequence(sessionId: string): Promise<number> {
  const [result] = await db
    .select({ maxSeq: max(agentEvents.sequence) })
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId));
  return result?.maxSeq ?? -1;
}

export function getAgentEvents(
  sessionId: string,
  afterSequence?: number
): Promise<{ sequence: number; eventData: unknown }[]> {
  const conditions = [eq(agentEvents.sessionId, sessionId)];
  if (afterSequence !== undefined && afterSequence > 0) {
    conditions.push(gt(agentEvents.sequence, afterSequence));
  }

  return db
    .select({
      sequence: agentEvents.sequence,
      eventData: agentEvents.eventData,
    })
    .from(agentEvents)
    .where(and(...conditions))
    .orderBy(agentEvents.sequence);
}
