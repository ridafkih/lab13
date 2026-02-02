import { docker } from "../../clients/docker";
import { config } from "../../config/environment";
import { LABELS } from "../../config/constants";
import { formatNetworkName } from "../../types/session";
import { findActiveSessionsForReconciliation } from "../repositories/session.repository";

export async function createSessionNetwork(sessionId: string): Promise<string> {
  const networkName = formatNetworkName(sessionId);
  await docker.createNetwork(networkName, { labels: { [LABELS.SESSION]: sessionId } });

  if (config.browserContainerName) {
    try {
      await docker.connectToNetwork(config.browserContainerName, networkName);
    } catch (error) {
      console.warn(`Failed to connect browser container to network ${networkName}:`, error);
    }
  }

  if (config.opencodeContainerName) {
    try {
      await docker.connectToNetwork(config.opencodeContainerName, networkName);
    } catch (error) {
      console.warn(`Failed to connect opencode container to network ${networkName}:`, error);
    }
  }

  return networkName;
}

function isNotConnectedError(error: unknown): boolean {
  return String(error).includes("is not connected to network");
}

export async function cleanupSessionNetwork(sessionId: string): Promise<void> {
  const networkName = formatNetworkName(sessionId);

  if (config.caddyContainerName) {
    try {
      await docker.disconnectFromNetwork(config.caddyContainerName, networkName);
    } catch (error) {
      if (!isNotConnectedError(error)) {
        console.warn(`Failed to disconnect caddy from network ${networkName}:`, error);
      }
    }
  }

  if (config.browserContainerName) {
    try {
      await docker.disconnectFromNetwork(config.browserContainerName, networkName);
    } catch (error) {
      if (!isNotConnectedError(error)) {
        console.warn(`Failed to disconnect browser from network ${networkName}:`, error);
      }
    }
  }

  if (config.opencodeContainerName) {
    try {
      await docker.disconnectFromNetwork(config.opencodeContainerName, networkName);
    } catch (error) {
      if (!isNotConnectedError(error)) {
        console.warn(`Failed to disconnect opencode from network ${networkName}:`, error);
      }
    }
  }

  await docker.removeNetwork(networkName);
}

export async function cleanupOrphanedNetworks(): Promise<number> {
  const networks = await docker.raw.listNetworks({
    filters: { label: [LABELS.SESSION] },
  });

  const activeSessions = await findActiveSessionsForReconciliation();
  const activeSessionIds = new Set(activeSessions.map((s) => s.id));

  const orphanedSessionIds = networks
    .map((n) => n.Labels?.[LABELS.SESSION])
    .filter((id): id is string => !!id && !activeSessionIds.has(id));

  await Promise.all(
    orphanedSessionIds.map((sessionId) => cleanupSessionNetwork(sessionId).catch(() => {})),
  );

  return orphanedSessionIds.length;
}
