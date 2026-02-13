import { db } from "@lab/database/client";
import { acpReplayCheckpoints } from "@lab/database/schema/acp-replay-checkpoints";
import { eq } from "drizzle-orm";

export interface ReplayCheckpointRow {
  parserVersion: number;
  lastSequence: number;
  replayState: Record<string, unknown>;
}

export async function getReplayCheckpoint(
  sessionId: string
): Promise<ReplayCheckpointRow | null> {
  const [row] = await db
    .select({
      parserVersion: acpReplayCheckpoints.parserVersion,
      lastSequence: acpReplayCheckpoints.lastSequence,
      replayState: acpReplayCheckpoints.replayState,
    })
    .from(acpReplayCheckpoints)
    .where(eq(acpReplayCheckpoints.sessionId, sessionId))
    .limit(1);

  if (!row || typeof row.replayState !== "object" || row.replayState === null) {
    return null;
  }

  return {
    parserVersion: row.parserVersion,
    lastSequence: row.lastSequence,
    replayState: Object.fromEntries(Object.entries(row.replayState)),
  };
}

export async function upsertReplayCheckpoint(
  sessionId: string,
  checkpoint: ReplayCheckpointRow
): Promise<void> {
  await db
    .insert(acpReplayCheckpoints)
    .values({
      sessionId,
      parserVersion: checkpoint.parserVersion,
      lastSequence: checkpoint.lastSequence,
      replayState: checkpoint.replayState,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: acpReplayCheckpoints.sessionId,
      set: {
        parserVersion: checkpoint.parserVersion,
        lastSequence: checkpoint.lastSequence,
        replayState: checkpoint.replayState,
        updatedAt: new Date(),
      },
    });
}
