import { db } from "@lab/database/client";
import { eq } from "drizzle-orm";
import { sessionMetadata } from "../../../../packages/database/src/schema/session-metadata";

export const INFERENCE_STATUS = {
  IDLE: "idle",
  GENERATING: "generating",
} as const;

export type InferenceStatus =
  (typeof INFERENCE_STATUS)[keyof typeof INFERENCE_STATUS];

interface SessionState {
  inferenceStatus: InferenceStatus;
  lastMessage?: string;
}

export class SessionStateStore {
  constructor() {}

  async getInferenceStatus(sessionId: string): Promise<InferenceStatus> {
    const row = await this.getRow(sessionId);
    const value = row?.inferenceStatus;
    if (value === INFERENCE_STATUS.GENERATING) {
      return INFERENCE_STATUS.GENERATING;
    }
    return INFERENCE_STATUS.IDLE;
  }

  async setInferenceStatus(
    sessionId: string,
    status: InferenceStatus
  ): Promise<void> {
    await db
      .insert(sessionMetadata)
      .values({
        sessionId,
        inferenceStatus: status,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sessionMetadata.sessionId,
        set: {
          inferenceStatus: status,
          updatedAt: new Date(),
        },
      });
  }

  async getLastMessage(sessionId: string): Promise<string | undefined> {
    const row = await this.getRow(sessionId);
    return row?.lastMessage ?? undefined;
  }

  async setLastMessage(sessionId: string, message: string): Promise<void> {
    if (!message) {
      return;
    }
    await db
      .insert(sessionMetadata)
      .values({
        sessionId,
        lastMessage: message,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sessionMetadata.sessionId,
        set: {
          lastMessage: message,
          updatedAt: new Date(),
        },
      });
  }

  async getState(sessionId: string): Promise<SessionState> {
    const [inferenceStatus, lastMessage] = await Promise.all([
      this.getInferenceStatus(sessionId),
      this.getLastMessage(sessionId),
    ]);
    return { inferenceStatus, lastMessage };
  }

  async clear(sessionId: string): Promise<void> {
    await db
      .delete(sessionMetadata)
      .where(eq(sessionMetadata.sessionId, sessionId));
  }

  private async getRow(sessionId: string): Promise<{
    inferenceStatus: string;
    lastMessage: string | null;
  } | null> {
    const [row] = await db
      .select({
        inferenceStatus: sessionMetadata.inferenceStatus,
        lastMessage: sessionMetadata.lastMessage,
      })
      .from(sessionMetadata)
      .where(eq(sessionMetadata.sessionId, sessionId))
      .limit(1);
    return row ?? null;
  }
}
