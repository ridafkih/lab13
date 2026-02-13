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
