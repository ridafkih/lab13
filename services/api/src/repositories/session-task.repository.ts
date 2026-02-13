import { db } from "@lab/database/client";
import { sessionTasks } from "@lab/database/schema/session-tasks";
import { asc, eq } from "drizzle-orm";

export type SessionTaskStatus = "pending" | "in_progress" | "completed";

export interface ReplaceSessionTaskInput {
  externalId: string | null;
  content: string;
  status: SessionTaskStatus;
  priority: number | null;
  position: number;
  sourceToolName: string;
}

export interface UpsertSessionTaskInput {
  externalId: string | null;
  content: string | null;
  status: SessionTaskStatus;
  priority: number | null;
  sourceToolName: string;
}

export interface SessionTaskSnapshot {
  id: string;
  content: string;
  status: SessionTaskStatus;
  priority: number | null;
  position: number;
}

export async function replaceSessionTasks(
  sessionId: string,
  tasks: ReplaceSessionTaskInput[]
): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction
      .delete(sessionTasks)
      .where(eq(sessionTasks.sessionId, sessionId));

    if (tasks.length === 0) {
      return;
    }

    await transaction.insert(sessionTasks).values(
      tasks.map((task) => ({
        sessionId,
        externalId: task.externalId,
        content: task.content,
        status: task.status,
        priority: task.priority,
        position: task.position,
        sourceToolName: task.sourceToolName,
        updatedAt: new Date(),
      }))
    );
  });
}

export async function upsertSessionTasks(
  sessionId: string,
  tasks: UpsertSessionTaskInput[]
): Promise<void> {
  if (tasks.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    const existing = await transaction
      .select({
        id: sessionTasks.id,
        externalId: sessionTasks.externalId,
        content: sessionTasks.content,
        position: sessionTasks.position,
      })
      .from(sessionTasks)
      .where(eq(sessionTasks.sessionId, sessionId))
      .orderBy(asc(sessionTasks.position), asc(sessionTasks.id));

    const byExternalId = new Map(
      existing
        .filter(
          (row): row is typeof row & { externalId: string } =>
            typeof row.externalId === "string" && row.externalId.length > 0
        )
        .map((row) => [row.externalId, row])
    );

    let nextPosition =
      existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

    for (const task of tasks) {
      const matched =
        task.externalId && byExternalId.has(task.externalId)
          ? byExternalId.get(task.externalId)
          : undefined;

      if (matched) {
        await transaction
          .update(sessionTasks)
          .set({
            content: task.content ?? matched.content,
            status: task.status,
            priority: task.priority,
            sourceToolName: task.sourceToolName,
            updatedAt: new Date(),
          })
          .where(eq(sessionTasks.id, matched.id));
        continue;
      }

      if (!task.content) {
        continue;
      }

      await transaction.insert(sessionTasks).values({
        sessionId,
        externalId: task.externalId,
        content: task.content,
        status: task.status,
        priority: task.priority,
        position: nextPosition,
        sourceToolName: task.sourceToolName,
        updatedAt: new Date(),
      });
      nextPosition += 1;
    }
  });
}

function normalizeSessionTaskStatus(status: string): SessionTaskStatus {
  if (status === "in_progress" || status === "completed") {
    return status;
  }
  return "pending";
}

export async function findSessionTasks(
  sessionId: string
): Promise<SessionTaskSnapshot[]> {
  const rows = await db
    .select({
      id: sessionTasks.id,
      content: sessionTasks.content,
      status: sessionTasks.status,
      priority: sessionTasks.priority,
      position: sessionTasks.position,
    })
    .from(sessionTasks)
    .where(eq(sessionTasks.sessionId, sessionId))
    .orderBy(asc(sessionTasks.position), asc(sessionTasks.id));

  return rows.map((row) => ({
    id: String(row.id),
    content: row.content,
    status: normalizeSessionTaskStatus(row.status),
    priority: row.priority ?? null,
    position: row.position,
  }));
}
