import { db } from "@lab/database/client";
import { projects } from "@lab/database/schema/projects";
import { type Session, sessions } from "@lab/database/schema/sessions";
import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { InternalError, orThrow } from "../shared/errors";
import { SESSION_STATUS } from "../types/session";

const visibleSessionConditions = [
  ne(sessions.status, SESSION_STATUS.DELETING),
  ne(sessions.status, SESSION_STATUS.POOLED),
];

export async function findSessionById(
  sessionId: string
): Promise<Session | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  return session ?? null;
}

export async function findSessionByIdOrThrow(
  sessionId: string
): Promise<Session> {
  return orThrow(await findSessionById(sessionId), "Session", sessionId);
}

export function findSessionsByProjectId(projectId: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), ...visibleSessionConditions));
}

export async function createSession(
  projectId: string,
  title?: string
): Promise<Session> {
  const [session] = await db
    .insert(sessions)
    .values({ projectId, title })
    .returning();
  if (!session) {
    throw new InternalError(
      "Failed to create session",
      "SESSION_CREATE_FAILED"
    );
  }
  return session;
}

export function updateSessionFields(
  sessionId: string,
  fields: {
    sandboxSessionId?: string | null;
    workspaceDirectory?: string | null;
    title?: string;
  }
): Promise<Session | null> {
  return db.transaction(async (tx) => {
    const setFields: Record<string, unknown> = { updatedAt: new Date() };

    if (fields.sandboxSessionId !== undefined) {
      setFields.sandboxSessionId = fields.sandboxSessionId;
    }
    if (fields.workspaceDirectory !== undefined) {
      setFields.workspaceDirectory = fields.workspaceDirectory;
    }
    if (fields.title !== undefined) {
      setFields.title = fields.title;
    }

    await tx.update(sessions).set(setFields).where(eq(sessions.id, sessionId));

    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    return session ?? null;
  });
}

export async function getSessionWorkspaceDirectory(
  sessionId: string
): Promise<string | null> {
  const [session] = await db
    .select({ workspaceDirectory: sessions.workspaceDirectory })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return session?.workspaceDirectory ?? null;
}

export async function updateSessionTitle(
  sessionId: string,
  title?: string
): Promise<Session | null> {
  await db
    .update(sessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return findSessionById(sessionId);
}

export async function updateSessionStatus(
  sessionId: string,
  status: string
): Promise<void> {
  await db
    .update(sessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function findAllSessionSummaries(): Promise<
  { id: string; projectId: string; title: string | null }[]
> {
  return db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      title: sessions.title,
    })
    .from(sessions)
    .where(and(...visibleSessionConditions));
}

export function findRunningSessions(): Promise<
  {
    id: string;
    sandboxSessionId: string | null;
    workspaceDirectory: string | null;
  }[]
> {
  return db
    .select({
      id: sessions.id,
      sandboxSessionId: sessions.sandboxSessionId,
      workspaceDirectory: sessions.workspaceDirectory,
    })
    .from(sessions)
    .where(
      inArray(sessions.status, [SESSION_STATUS.RUNNING, SESSION_STATUS.POOLED])
    );
}

export function findActiveSessionsForReconciliation(): Promise<
  { id: string }[]
> {
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      inArray(sessions.status, [SESSION_STATUS.RUNNING, SESSION_STATUS.POOLED])
    );
}

export function findSessionsWithProject({
  projectId,
  limit,
}: {
  projectId?: string;
  limit?: number;
}) {
  const conditions = [...visibleSessionConditions];
  if (projectId) {
    conditions.push(eq(sessions.projectId, projectId));
  }

  return db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      projectName: projects.name,
      title: sessions.title,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt))
    .limit(limit ?? 10);
}

export function searchSessionsWithProject({
  query,
  limit,
}: {
  query: string;
  limit?: number;
}) {
  const searchLimit = limit ?? 5;

  return db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      projectName: projects.name,
      title: sessions.title,
      sandboxSessionId: sessions.sandboxSessionId,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(
      and(
        ...visibleSessionConditions,
        or(
          ilike(sessions.title, `%${query}%`),
          ilike(projects.name, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sessions.createdAt))
    .limit(searchLimit * 2);
}
