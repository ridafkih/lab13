import type { AcpClient } from "../acp/client";
import { findSessionById } from "../repositories/session.repository";
import { ExternalServiceError } from "../shared/errors";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";

interface SendMessageOptions {
  sessionId: string;
  sandboxSessionId: string;
  content: string;
  acp: AcpClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

export async function sendMessageToSession(
  options: SendMessageOptions
): Promise<void> {
  const { sessionId, content, acp, publisher, sessionStateStore } = options;

  const session = await findSessionById(sessionId);
  if (!session?.sandboxSessionId) {
    throw new ExternalServiceError(
      `No sandbox session for session ${sessionId}`,
      "SANDBOX_SESSION_MISSING"
    );
  }

  try {
    await acp.sendMessage(sessionId, content);
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to send message to session: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_PROMPT_FAILED"
    );
  }

  await sessionStateStore.setLastMessage(sessionId, content);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: content }
  );
}
