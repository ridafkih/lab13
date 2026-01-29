import { AgentManager, type AgentSessionConfig } from "@lab/agent";
import { publisher } from "./publisher";

const opencodeUrl = process.env.OPENCODE_URL;
if (!opencodeUrl) {
  throw new Error("OPENCODE_URL environment variable is required");
}

const agentManager = new AgentManager({ opencodeUrl });

export async function createAgentSession(config: AgentSessionConfig) {
  const session = await agentManager.createSession(config);
  const { sessionId } = config;

  session.on("token", (content) => {
    publisher.publishEvent("sessionStream", { uuid: sessionId }, { type: "token", content });
  });

  session.on("message", (message) => {
    publisher.publishDelta("sessionMessages", { uuid: sessionId }, { type: "append", message });
  });

  session.on("toolStart", (tool) => {
    publisher.publishDelta("sessionAgentTools", { uuid: sessionId }, { type: "add", tool });
  });

  session.on("toolEnd", (tool) => {
    publisher.publishDelta("sessionAgentTools", { uuid: sessionId }, { type: "update", tool });
  });

  session.on("complete", () => {
    publisher.publishEvent("sessionStream", { uuid: sessionId }, { type: "complete" });
  });

  session.on("error", (error) => {
    publisher.publishEvent(
      "sessionStream",
      { uuid: sessionId },
      { type: "error", content: error.message },
    );
  });

  return session;
}

export function getAgentSession(sessionId: string) {
  return agentManager.getSession(sessionId);
}

export function hasAgentSession(sessionId: string) {
  return agentManager.hasSession(sessionId);
}

export async function destroyAgentSession(sessionId: string) {
  return agentManager.destroySession(sessionId);
}
