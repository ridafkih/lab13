import type { AcpClient } from "../acp/client";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import { ExternalServiceError } from "../shared/errors";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import {
  INFERENCE_STATUS,
  type SessionStateStore,
} from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";

interface SendMessageOptions {
  sessionId: string;
  content: string;
  acp: AcpClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
  sessionLifecycle: SessionLifecycleManager;
}

const SEND_MESSAGE_TIMEOUT_MS = 45_000;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isRecoverableSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No session for server") ||
    message.includes("Process stdin not available") ||
    message.includes("Request failed with status 500") ||
    message.includes("timed out")
  );
}

function asExternalServiceError(error: unknown): ExternalServiceError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalServiceError(
    `Failed to send message to session: ${message}`,
    "SANDBOX_PROMPT_FAILED"
  );
}

async function ensureConnectedSession(params: {
  sessionId: string;
  acp: AcpClient;
  session: {
    projectId: string;
    sandboxSessionId: string | null;
    workspaceDirectory: string | null;
  };
  sessionLifecycle: SessionLifecycleManager;
}): Promise<{ sandboxSessionId: string; workspaceDirectory: string }> {
  const { sessionId, acp, session, sessionLifecycle } = params;

  if (acp.hasSession(sessionId) && session.sandboxSessionId) {
    return {
      sandboxSessionId: session.sandboxSessionId,
      workspaceDirectory: session.workspaceDirectory ?? "",
    };
  }

  const workspaceDirectory =
    session.workspaceDirectory ??
    (await resolveWorkspacePathBySession(sessionId));
  const acpConfig = await sessionLifecycle.buildAcpSessionConfig(
    sessionId,
    session.projectId
  );
  const sandboxSessionId = await withTimeout(
    acp.createSession(sessionId, {
      cwd: workspaceDirectory,
      loadSessionId: session.sandboxSessionId ?? undefined,
      mcpServers: acpConfig.mcpServers,
      systemPrompt: acpConfig.systemPrompt,
    }),
    SEND_MESSAGE_TIMEOUT_MS,
    "ACP session initialization"
  );

  if (!sandboxSessionId) {
    throw new ExternalServiceError(
      `No sandbox session for session ${sessionId}`,
      "SANDBOX_SESSION_MISSING"
    );
  }

  return { sandboxSessionId, workspaceDirectory };
}

export async function sendMessageToSession(
  options: SendMessageOptions
): Promise<void> {
  const {
    sessionId,
    content,
    acp,
    publisher,
    sessionStateStore,
    sessionLifecycle,
  } = options;

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new ExternalServiceError(
      `No session found for session ${sessionId}`,
      "SANDBOX_SESSION_MISSING"
    );
  }

  await sessionStateStore.setInferenceStatus(
    sessionId,
    INFERENCE_STATUS.GENERATING
  );
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { inferenceStatus: INFERENCE_STATUS.GENERATING }
  );

  let currentSession = session;
  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex++) {
    try {
      const { sandboxSessionId, workspaceDirectory } =
        await ensureConnectedSession({
          sessionId,
          acp,
          session: currentSession,
          sessionLifecycle,
        });
      if (currentSession.sandboxSessionId !== sandboxSessionId) {
        await updateSessionFields(sessionId, {
          sandboxSessionId,
          workspaceDirectory,
        });
      }

      await withTimeout(
        acp.sendMessage(sessionId, content),
        SEND_MESSAGE_TIMEOUT_MS,
        "ACP send message"
      );
      break;
    } catch (error) {
      const isFinalAttempt = attemptIndex === 1;

      if (isFinalAttempt || !isRecoverableSendError(error)) {
        await sessionStateStore.setInferenceStatus(
          sessionId,
          INFERENCE_STATUS.IDLE
        );
        publisher.publishDelta(
          "sessionMetadata",
          { uuid: sessionId },
          { inferenceStatus: INFERENCE_STATUS.IDLE }
        );
        throw asExternalServiceError(error);
      }

      await acp.destroySession(sessionId);
      await updateSessionFields(sessionId, { sandboxSessionId: null });
      currentSession = { ...currentSession, sandboxSessionId: null };
    }
  }

  await sessionStateStore.setLastMessage(sessionId, content);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: content }
  );
}
