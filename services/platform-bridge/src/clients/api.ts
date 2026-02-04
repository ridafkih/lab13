import { config } from "../config/environment";
import type {
  OrchestrationRequest,
  OrchestrationResult,
  ChatRequest,
  ChatResult,
} from "../types/messages";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = config.apiUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Orchestration failed: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  async getSession(sessionId: string): Promise<{ id: string; status: string } | null> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json();
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null && session.status === "running";
  }

  async generateSessionSummary(sessionId: string): Promise<SummaryResult> {
    const response = await fetch(`${this.baseUrl}/internal/sessions/${sessionId}/summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Summary generation failed: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Chat orchestration failed: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  async notifySessionComplete(request: {
    sessionId: string;
    platformOrigin: string;
    platformChatId: string;
  }): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate/chat/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Session complete notification failed: ${error.error || response.statusText}`,
      );
    }

    return response.json();
  }

  async getSessionScreenshot(sessionId: string): Promise<ScreenshotResult | null> {
    const response = await fetch(`${this.baseUrl}/internal/sessions/${sessionId}/screenshot`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  }
}

export interface ScreenshotResult {
  sessionId: string;
  timestamp: number;
  format: string;
  encoding: string;
  data: string;
}

export interface SummaryResult {
  success: boolean;
  outcome?: string;
  summary: string;
  orchestrationId?: string;
  platformOrigin?: string;
  platformChatId?: string;
  alreadySent?: boolean;
}

export const apiClient = new ApiClient();
