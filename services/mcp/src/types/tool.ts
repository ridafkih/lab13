import type { DockerClient } from "@lab/sandbox-docker";

export interface ToolContext {
  docker: DockerClient;
}
