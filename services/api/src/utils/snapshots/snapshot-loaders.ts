import { config } from "../../config/environment";
import { isContainerStatus } from "../../types/container";
import { getChangeType } from "../../types/file";
import { formatSessionTitle, formatProxyUrl } from "../../types/session";
import { findProjectSummaries } from "../repositories/project.repository";
import { findAllSessionSummaries, getSessionOpencodeId } from "../repositories/session.repository";
import {
  getSessionContainersWithDetails,
  findPortsByContainerId,
} from "../repositories/container.repository";
import { opencode } from "../../clients/opencode";
import type { BrowserService } from "../browser/browser-service";
import type { AppSchema } from "@lab/multiplayer-sdk";

export async function loadProjects() {
  return findProjectSummaries();
}

export async function loadSessions() {
  const sessions = await findAllSessionSummaries();
  return sessions.map((session) => ({
    ...session,
    title: formatSessionTitle(session.id),
  }));
}

export async function loadSessionContainers(sessionId: string) {
  const rows = await getSessionContainersWithDetails(sessionId);

  return Promise.all(
    rows.map(async (row) => {
      const ports = await findPortsByContainerId(row.containerId);
      const name = row.hostname ?? row.image.split("/").pop()?.split(":")[0] ?? "container";
      const urls = ports.map(({ port }) => ({
        port,
        url: formatProxyUrl(sessionId, port, config.proxyBaseDomain),
      }));

      return {
        id: row.id,
        name,
        status: isContainerStatus(row.status) ? row.status : ("error" as const),
        urls,
      };
    }),
  );
}

export async function loadSessionChangedFiles(sessionId: string) {
  const opencodeSessionId = await getSessionOpencodeId(sessionId);
  if (!opencodeSessionId) return [];

  try {
    const response = await opencode.session.diff({ sessionID: opencodeSessionId });
    if (!response.data) return [];

    return response.data.map((diff) => ({
      path: diff.file,
      originalContent: diff.before,
      currentContent: diff.after,
      status: "pending" as const,
      changeType: getChangeType(diff.before, diff.after),
    }));
  } catch {
    return [];
  }
}

type ChannelName = keyof AppSchema["channels"];
type SnapshotLoader = (session: string | null) => Promise<unknown>;

export function createSnapshotLoaders(
  browserService: BrowserService,
): Record<ChannelName, SnapshotLoader> {
  return {
    projects: async () => loadProjects(),
    sessions: async () => loadSessions(),
    sessionMetadata: async () => ({ title: "", participantCount: 0 }),
    sessionContainers: async (session) => (session ? loadSessionContainers(session) : null),
    sessionTyping: async () => [],
    sessionPromptEngineers: async () => [],
    sessionChangedFiles: async (session) => (session ? loadSessionChangedFiles(session) : null),
    sessionBranches: async () => [],
    sessionLinks: async () => [],
    sessionLogs: async () => [],
    sessionMessages: async () => [],
    sessionBrowserState: async (session) =>
      session ? browserService.getBrowserSnapshot(session) : null,
    sessionBrowserFrames: async (session) => {
      if (!session) return null;
      const frame = browserService.getCachedFrame(session);
      return { lastFrame: frame ?? null, timestamp: frame ? Date.now() : null };
    },
    sessionBrowserInput: async () => ({}),
  };
}
