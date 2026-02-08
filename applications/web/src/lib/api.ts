import { createClient } from "@lab/client";
import { mutate } from "swr";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  throw Error("Must set NEXT_PUBLIC_API_URL");
}

export const api = createClient({ baseUrl: API_BASE });

export async function fetchChannelSnapshot<T>(channel: string, sessionId: string): Promise<T> {
  const response = await fetch(`${API_BASE}/channels/${channel}/snapshot?session=${sessionId}`);
  if (!response.ok) throw new Error(`Failed to fetch ${channel} snapshot`);
  const { data } = await response.json();
  return data as T;
}

const pendingContainerPrefetches = new Set<string>();

export function prefetchSessionContainers(sessionId: string): void {
  const cacheKey = `sessionContainers-${sessionId}`;
  if (pendingContainerPrefetches.has(sessionId)) return;

  pendingContainerPrefetches.add(sessionId);
  fetchChannelSnapshot("sessionContainers", sessionId)
    .then((data) => mutate(cacheKey, data, false))
    .finally(() => pendingContainerPrefetches.delete(sessionId));
}

interface GitHubSettingsInput {
  pat?: string;
  username?: string;
  authorName?: string;
  authorEmail?: string;
  attributeAgent?: boolean;
}

interface GitHubSettingsResponse {
  configured: boolean;
  id?: string;
  username?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  attributeAgent?: boolean;
  hasPatConfigured?: boolean;
  isOAuthConnected?: boolean;
  oauthConnectedAt?: string | null;
}

export async function getGitHubSettings(): Promise<GitHubSettingsResponse> {
  const response = await fetch(`${API_BASE}/github/settings`);
  if (!response.ok) throw new Error("Failed to fetch GitHub settings");
  return response.json();
}

export async function saveGitHubSettings(
  settings: GitHubSettingsInput,
): Promise<GitHubSettingsResponse> {
  const response = await fetch(`${API_BASE}/github/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error("Failed to save GitHub settings");
  return response.json();
}

export async function disconnectGitHub(): Promise<void> {
  const response = await fetch(`${API_BASE}/github/disconnect`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to disconnect GitHub");
}

export function getGitHubAuthUrl(): string {
  return `${API_BASE}/github/auth`;
}
