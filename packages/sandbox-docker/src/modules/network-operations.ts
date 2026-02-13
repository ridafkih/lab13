import type { NetworkCreateOptions, NetworkInfo } from "@lab/sandbox-sdk";
import type Dockerode from "dockerode";
import { hasStatusCode, isNotFoundError } from "../utils/error-handling";

interface NetworkContainer {
  Name?: string;
}

function hasContainerName(value: unknown): value is NetworkContainer {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "Name" in value;
}

function matchesContainerId(
  connectedId: string,
  targetIdOrName: string
): boolean {
  return (
    connectedId === targetIdOrName || connectedId.startsWith(targetIdOrName)
  );
}

function matchesContainerName(
  containerInfo: unknown,
  targetIdOrName: string
): boolean {
  if (!hasContainerName(containerInfo)) {
    return false;
  }

  return containerInfo.Name === targetIdOrName;
}

function isContainerMatch(
  connectedId: string,
  containerInfo: unknown,
  targetIdOrName: string
): boolean {
  return (
    matchesContainerId(connectedId, targetIdOrName) ||
    matchesContainerName(containerInfo, targetIdOrName)
  );
}

function isActiveEndpointsError(error: unknown): boolean {
  if (!hasStatusCode(error) || error.statusCode !== 403) {
    return false;
  }

  if (typeof error !== "object" || error === null || !("json" in error)) {
    return false;
  }

  const payload = error.json;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("message" in payload)
  ) {
    return false;
  }

  return (
    typeof payload.message === "string" &&
    payload.message.includes("active endpoints")
  );
}

export class NetworkOperations {
  private readonly docker: Dockerode;

  constructor(docker: Dockerode) {
    this.docker = docker;
  }

  async createNetwork(
    name: string,
    options: NetworkCreateOptions = {}
  ): Promise<void> {
    await this.docker.createNetwork({
      Name: name,
      Driver: options.driver ?? "bridge",
      Labels: options.labels,
    });
  }

  async removeNetwork(name: string): Promise<void> {
    try {
      await this.docker.getNetwork(name).remove();
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }

      if (!isActiveEndpointsError(error)) {
        throw error;
      }

      await this.disconnectAllNetworkEndpoints(name);

      try {
        await this.docker.getNetwork(name).remove();
      } catch (retryError) {
        if (isNotFoundError(retryError)) {
          return;
        }
        throw retryError;
      }
    }
  }

  async networkExists(name: string): Promise<boolean> {
    try {
      await this.docker.getNetwork(name).inspect();
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async isConnectedToNetwork(
    containerIdOrName: string,
    networkName: string
  ): Promise<boolean> {
    try {
      const networkInfo = await this.docker.getNetwork(networkName).inspect();
      const connectedContainers = networkInfo.Containers ?? {};

      return Object.entries(connectedContainers).some(
        ([connectedId, containerInfo]) =>
          isContainerMatch(connectedId, containerInfo, containerIdOrName)
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async connectToNetwork(
    containerId: string,
    networkName: string,
    options?: { aliases?: string[] }
  ): Promise<void> {
    const endpointConfig = options?.aliases
      ? { Aliases: options.aliases }
      : undefined;

    await this.docker.getNetwork(networkName).connect({
      Container: containerId,
      EndpointConfig: endpointConfig,
    });
  }

  async disconnectFromNetwork(
    containerId: string,
    networkName: string
  ): Promise<void> {
    try {
      await this.docker
        .getNetwork(networkName)
        .disconnect({ Container: containerId });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  private async disconnectAllNetworkEndpoints(
    networkName: string
  ): Promise<void> {
    const networkInfo = await this.docker.getNetwork(networkName).inspect();
    const connectedContainers = networkInfo.Containers ?? {};

    await Promise.all(
      Object.keys(connectedContainers).map(async (containerId) => {
        try {
          await this.docker
            .getNetwork(networkName)
            .disconnect({ Container: containerId, Force: true });
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }
      })
    );
  }

  async listNetworks(options?: { labels?: string[] }): Promise<NetworkInfo[]> {
    const filters: Record<string, string[]> = {};

    if (options?.labels) {
      filters.label = options.labels;
    }

    const networks = await this.docker.listNetworks({ filters });

    return networks.map((network) => ({
      name: network.Name ?? "",
      labels: network.Labels ?? {},
    }));
  }
}
