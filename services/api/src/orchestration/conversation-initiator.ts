import type { NewSessionRequest } from "acp-http-client";
import type { AcpClient } from "../acp/client";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import { ExternalServiceError } from "../shared/errors";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import type { SessionStateStore } from "../state/session-state-store";
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
}

function getDefaultModelId(): string | undefined {
  return process.env.DEFAULT_CONVERSATION_MODEL_ID;
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
    const sandboxSessionId = await acp.createSession(sessionId, {
      cwd: workspacePath,
      model: modelId,
      systemPrompt: options.systemPrompt,
      mcpServers: options.mcpServers,
      loadSessionId,
    });

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

  await initiateAgentSession({
    sessionId,
    modelId: options.modelId,
    acp,
  });

  try {
    await acp.sendMessage(sessionId, task);
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to send initial message: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_INITIAL_PROMPT_FAILED"
    );
  }

  await sessionStateStore.setLastMessage(sessionId, task);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: task }
  );
}
