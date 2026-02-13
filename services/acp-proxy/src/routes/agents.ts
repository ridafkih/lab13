const CLAUDE_AGENT = {
  id: "claude",
  name: "Claude Code",
  installed: true,
  capabilities: {
    permissions: true,
    questions: true,
  },
};

const CONFIG_OPTIONS = [
  {
    category: "model",
    id: "model",
    name: "Model",
    options: [
      { name: "Claude Opus 4.6", value: "claude-opus-4-6" },
      { name: "Claude Sonnet 4.5", value: "claude-sonnet-4-5-20250929" },
      { name: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
    ],
  },
];

export function handleListAgents(): Response {
  return Response.json({ agents: [CLAUDE_AGENT] });
}

export function handleGetAgent(agentId: string, url: URL): Response {
  if (agentId !== "claude") {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const includeConfig = url.searchParams.get("config") === "true";

  if (includeConfig) {
    return Response.json({
      ...CLAUDE_AGENT,
      configOptions: CONFIG_OPTIONS,
    });
  }

  return Response.json(CLAUDE_AGENT);
}
