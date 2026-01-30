import { db } from "@lab/database/client";
import { browserSessions } from "@lab/database/schema/browser-sessions";
import { sessions } from "@lab/database/schema/sessions";
import { eq } from "drizzle-orm";
import {
  type StateStore,
  type StateStoreOptions,
  type BrowserSessionState,
  type DesiredState,
  type CurrentState,
  BrowserSessionState as BrowserSessionStateSchema,
  sessionNotFound,
  validationFailed,
} from "@lab/browser-orchestration";

const mapDbToState = (session: typeof browserSessions.$inferSelect): BrowserSessionState => ({
  sessionId: session.sessionId,
  desiredState: session.desiredState as DesiredState,
  currentState: session.currentState as CurrentState,
  streamPort: session.streamPort,
  lastUrl: session.lastUrl,
  errorMessage: session.errorMessage,
  retryCount: session.retryCount,
  lastHeartbeat: session.lastHeartbeat,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

export const createDbStateStore = (): StateStore => {
  const getState = async (sessionId: string): Promise<BrowserSessionState | null> => {
    const [session] = await db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.sessionId, sessionId))
      .limit(1);

    return session ? mapDbToState(session) : null;
  };

  const setState = async (state: BrowserSessionState): Promise<void> => {
    const parsed = BrowserSessionStateSchema.safeParse(state);
    if (!parsed.success) {
      throw validationFailed(parsed.error.message, state.sessionId);
    }

    await db
      .insert(browserSessions)
      .values({
        sessionId: state.sessionId,
        desiredState: state.desiredState,
        currentState: state.currentState,
        streamPort: state.streamPort,
        lastUrl: state.lastUrl,
        errorMessage: state.errorMessage,
        retryCount: state.retryCount,
        lastHeartbeat: state.lastHeartbeat,
      })
      .onConflictDoUpdate({
        target: browserSessions.sessionId,
        set: {
          desiredState: state.desiredState,
          currentState: state.currentState,
          streamPort: state.streamPort,
          lastUrl: state.lastUrl,
          errorMessage: state.errorMessage,
          retryCount: state.retryCount,
          lastHeartbeat: state.lastHeartbeat,
          updatedAt: new Date(),
        },
      });
  };

  const setDesiredState = async (
    sessionId: string,
    desiredState: DesiredState,
  ): Promise<BrowserSessionState> => {
    const [parentSession] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!parentSession) {
      throw sessionNotFound(sessionId);
    }

    const [session] = await db
      .insert(browserSessions)
      .values({
        sessionId,
        desiredState,
        currentState: "stopped",
      })
      .onConflictDoUpdate({
        target: browserSessions.sessionId,
        set: {
          desiredState,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!session) {
      throw sessionNotFound(sessionId);
    }

    return mapDbToState(session);
  };

  const setCurrentState = async (
    sessionId: string,
    currentState: CurrentState,
    options: StateStoreOptions = {},
  ): Promise<BrowserSessionState> => {
    const updateData: Record<string, unknown> = {
      currentState,
      updatedAt: new Date(),
    };

    if (options.streamPort !== undefined) {
      updateData.streamPort = options.streamPort;
    }
    if (options.errorMessage !== undefined) {
      updateData.errorMessage = options.errorMessage;
    }
    if (options.retryCount !== undefined) {
      updateData.retryCount = options.retryCount;
    }
    if (options.lastUrl !== undefined) {
      updateData.lastUrl = options.lastUrl;
    }

    const [session] = await db
      .update(browserSessions)
      .set(updateData)
      .where(eq(browserSessions.sessionId, sessionId))
      .returning();

    if (!session) {
      throw sessionNotFound(sessionId);
    }

    return mapDbToState(session);
  };

  const transitionState = async (
    sessionId: string,
    transition: (current: BrowserSessionState) => BrowserSessionState,
  ): Promise<BrowserSessionState> => {
    const current = await getState(sessionId);
    if (!current) {
      throw sessionNotFound(sessionId);
    }

    const newState = transition(current);
    const parsed = BrowserSessionStateSchema.safeParse(newState);
    if (!parsed.success) {
      throw validationFailed(parsed.error.message, sessionId);
    }

    await setState(parsed.data);
    return parsed.data;
  };

  const getAllSessions = async (): Promise<BrowserSessionState[]> => {
    const sessions = await db.select().from(browserSessions);
    return sessions.map(mapDbToState);
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    await db.delete(browserSessions).where(eq(browserSessions.sessionId, sessionId));
  };

  const updateHeartbeat = async (sessionId: string): Promise<void> => {
    const [session] = await db
      .update(browserSessions)
      .set({
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(browserSessions.sessionId, sessionId))
      .returning();

    if (!session) {
      throw sessionNotFound(sessionId);
    }
  };

  const setLastUrl = async (sessionId: string, url: string | null): Promise<void> => {
    const [session] = await db
      .update(browserSessions)
      .set({
        lastUrl: url,
        updatedAt: new Date(),
      })
      .where(eq(browserSessions.sessionId, sessionId))
      .returning();

    if (!session) {
      throw sessionNotFound(sessionId);
    }
  };

  return {
    getState,
    setState,
    setDesiredState,
    setCurrentState,
    transitionState,
    getAllSessions,
    deleteSession,
    updateHeartbeat,
    setLastUrl,
  };
};
