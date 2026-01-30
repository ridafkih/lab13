import { getSocketDir } from "agent-browser";

const SOCKET_DIR = getSocketDir();

export async function runAgentBrowser(sessionId: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["bunx", "agent-browser", ...args], {
    env: {
      ...process.env,
      AGENT_BROWSER_SESSION: sessionId,
      AGENT_BROWSER_SOCKET_DIR: SOCKET_DIR,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr || `agent-browser exited with code ${exitCode}`);
  }

  return output.trim();
}

export async function navigate(sessionId: string, url: string): Promise<void> {
  await runAgentBrowser(sessionId, ["open", url]);
}

export async function getCurrentUrl(sessionId: string): Promise<string | null> {
  const url = await runAgentBrowser(sessionId, ["get", "url"]);
  return url || null;
}
