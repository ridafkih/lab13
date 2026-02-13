import type { NewSessionRequest } from "acp-http-client";
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

interface InitiateAgentSessionOptions {
  sessionId: string;
  modelId?: string;
  acp: AcpClient;
  systemPrompt?: string;
  mcpServers?: NewSessionRequest["mcpServers"];
}

interface InitiateConversationOptions extends InitiateAgentSessionOptions {
  task: string;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
  sessionLifecycle?: SessionLifecycleManager;
}

const SESSION_OPERATION_TIMEOUT_MS = 45_000;

function getDefaultModelId(): string | undefined {
  return process.env.DEFAULT_CONVERSATION_MODEL_ID;
}

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

export async function initiateAgentSession(
  options: InitiateAgentSessionOptions
): Promise<string> {
  const { sessionId, acp } = options;

  const existing = await findSessionById(sessionId);
  const modelId = options.modelId ?? getDefaultModelId();
  const workspacePath =
    existing?.workspaceDirectory ??
    (await resolveWorkspacePathBySession(sessionId));

  if (existing?.sandboxSessionId && acp.hasSession(sessionId)) {
    return existing.sandboxSessionId;
  }

  const loadSessionId = existing?.sandboxSessionId ?? undefined;

  try {
    const sandboxSessionId = await withTimeout(
      acp.createSession(sessionId, {
        cwd: workspacePath,
        model: modelId,
        systemPrompt: options.systemPrompt,
        mcpServers: options.mcpServers,
        loadSessionId,
      }),
      SESSION_OPERATION_TIMEOUT_MS,
      "ACP create session"
    );

    await updateSessionFields(sessionId, {
      sandboxSessionId,
      workspaceDirectory: workspacePath,
    });

    return sandboxSessionId;
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to create session: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_SESSION_CREATE_FAILED"
    );
  }
}

export async function initiateConversation(
  options: InitiateConversationOptions
): Promise<void> {
  const { sessionId, task, acp, publisher, sessionStateStore } = options;
  const sessionForConfig = options.sessionLifecycle
    ? await findSessionById(sessionId)
    : null;
  const derivedAcpConfig =
    options.sessionLifecycle && sessionForConfig
      ? await options.sessionLifecycle.buildAcpSessionConfig(
          sessionId,
          sessionForConfig.projectId
        )
      : null;
  const systemPrompt = derivedAcpConfig?.systemPrompt ?? options.systemPrompt;
  const mcpServers = derivedAcpConfig?.mcpServers ?? options.mcpServers;

  await sessionStateStore.setInferenceStatus(
    sessionId,
    INFERENCE_STATUS.GENERATING
  );
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { inferenceStatus: INFERENCE_STATUS.GENERATING }
  );

  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex++) {
    await initiateAgentSession({
      sessionId,
      modelId: options.modelId,
      acp,
      systemPrompt,
      mcpServers,
    });

    try {
      await withTimeout(
        acp.sendMessage(sessionId, task),
        SESSION_OPERATION_TIMEOUT_MS,
        "ACP send initial message"
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
        throw new ExternalServiceError(
          `Failed to send initial message: ${error instanceof Error ? error.message : String(error)}`,
          "SANDBOX_INITIAL_PROMPT_FAILED"
        );
      }

      await acp.destroySession(sessionId);
      await updateSessionFields(sessionId, { sandboxSessionId: null });
    }
  }

  await sessionStateStore.setLastMessage(sessionId, task);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: task }
  );
}
