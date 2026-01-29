import type { AgentConfig, AgentSessionConfig } from "./types";
import { AgentSession } from "./session";

export class AgentManager {
  private config: AgentConfig;
  private sessions: Map<string, AgentSession> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async createSession(config: AgentSessionConfig): Promise<AgentSession> {
    if (this.sessions.has(config.sessionId)) {
      throw new Error(`Agent session already exists for session: ${config.sessionId}`);
    }

    const session = new AgentSession(config, this.config.opencodeUrl);
    await session.init();

    this.sessions.set(config.sessionId, session);

    return session;
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    await session.destroy();
    this.sessions.delete(sessionId);
    return true;
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
