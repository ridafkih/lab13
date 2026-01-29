import { EventEmitter } from "node:events";
import { createOpencodeClient, type OpencodeClient, type TextPart } from "@opencode-ai/sdk/client";
import type {
  AgentSessionConfig,
  AgentEvents,
  AgentMessage,
  ToolInvocation,
  SessionContainer,
  ModelSelection,
} from "./types";

export class AgentSession extends EventEmitter {
  private config: AgentSessionConfig;
  private client: OpencodeClient;
  private containers: Map<string, SessionContainer>;
  private isProcessing = false;
  private opencodeSessionId: string | null = null;

  constructor(config: AgentSessionConfig, opencodeUrl: string) {
    super();
    this.config = config;
    this.client = createOpencodeClient({
      baseUrl: opencodeUrl,
    });

    this.containers = new Map();
    for (const container of config.containers) {
      this.containers.set(container.id, container);
    }
  }

  async init(): Promise<void> {
    const response = await this.client.session.create({});

    if (response.error || !response.data) {
      throw new Error(`Failed to create OpenCode session: ${JSON.stringify(response.error)}`);
    }

    this.opencodeSessionId = response.data.id;
  }

  override on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof AgentEvents>(
    event: K,
    ...args: Parameters<AgentEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  get sessionId(): string {
    return this.config.sessionId;
  }

  get isActive(): boolean {
    return this.isProcessing;
  }

  getContainers(): SessionContainer[] {
    return Array.from(this.containers.values());
  }

  async getMessages(): Promise<AgentMessage[]> {
    if (!this.opencodeSessionId) {
      return [];
    }

    try {
      const response = await this.client.session.messages({
        path: { id: this.opencodeSessionId },
      });

      if (!response.data) {
        return [];
      }

      return response.data.map((message) => this.transformOpenCodeMessage(message));
    } catch (error) {
      console.error("Failed to fetch messages from OpenCode:", error);
      return [];
    }
  }

  private transformOpenCodeMessage(openCodeMessage: {
    info: { id: string; role: "user" | "assistant"; time: { created: number } };
    parts: Array<{ type: string; text?: string }>;
  }): AgentMessage {
    const textParts = openCodeMessage.parts.filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    );
    const content = textParts.map((part) => part.text).join("\n");

    return {
      id: openCodeMessage.info.id,
      role: openCodeMessage.info.role,
      content,
      timestamp: openCodeMessage.info.time.created,
    };
  }

  async sendMessage(content: string, model?: ModelSelection): Promise<void> {
    if (!this.opencodeSessionId) {
      throw new Error("Session not initialized");
    }

    if (this.isProcessing) {
      throw new Error("Agent is already processing a message");
    }

    this.isProcessing = true;

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    this.emit("message", userMessage);

    try {
      await this.processWithOpenCode(content, model);
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      this.isProcessing = false;
      this.emit("complete");
    }
  }

  private async processWithOpenCode(userMessage: string, model?: ModelSelection): Promise<void> {
    const response = await this.client.session.prompt({
      path: { id: this.opencodeSessionId! },
      body: {
        parts: [{ type: "text", text: userMessage }],
        system: this.config.systemPrompt,
        model: model ? { providerID: model.providerId, modelID: model.modelId } : undefined,
      },
    });

    if (response.error) {
      throw new Error(`OpenCode API error: ${JSON.stringify(response.error)}`);
    }

    if (!response.data) {
      throw new Error("No response data from OpenCode");
    }

    const { info, parts } = response.data;

    for (const part of parts) {
      if (part.type === "text" && "text" in part) {
        this.emit("token", part.text);
      } else if (part.type === "tool" && "tool" in part && "state" in part) {
        const toolPart = part as {
          callID: string;
          tool: string;
          state: { status: string; input?: Record<string, unknown>; output?: string };
        };

        if (toolPart.state.status === "running") {
          const toolInvocation: ToolInvocation = {
            id: toolPart.callID,
            name: toolPart.tool,
            status: "running",
            args: toolPart.state.input,
          };
          this.emit("toolStart", toolInvocation);
        } else if (toolPart.state.status === "completed") {
          const toolInvocation: ToolInvocation = {
            id: toolPart.callID,
            name: toolPart.tool,
            status: "completed",
            result: toolPart.state.output,
          };
          this.emit("toolEnd", toolInvocation);
        }
      }
    }

    const textParts = parts.filter((part): part is TextPart => part.type === "text");
    const assistantContent = textParts.map((part) => part.text).join("\n");

    if (assistantContent) {
      const assistantMessage: AgentMessage = {
        id: info.id,
        role: "assistant",
        content: assistantContent,
        timestamp: info.time.created,
      };
      this.emit("message", assistantMessage);
    }
  }

  stop(): void {
    this.isProcessing = false;
  }

  async destroy(): Promise<void> {
    this.stop();
    this.removeAllListeners();

    if (this.opencodeSessionId) {
      try {
        await this.client.session.delete({ path: { id: this.opencodeSessionId } });
      } catch (error) {
        console.error("Failed to delete OpenCode session:", error);
      }
    }
  }
}
