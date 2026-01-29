import Dockerode from "dockerode";
import type {
  SandboxProvider,
  ContainerCreateOptions,
  ContainerInfo,
  ContainerState,
  ExitResult,
  LogChunk,
  NetworkCreateOptions,
  ExecOptions,
  ExecResult,
} from "@lab/sdk";

const VALID_CONTAINER_STATES: readonly string[] = [
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
];

function isContainerState(status: string): status is ContainerState {
  return VALID_CONTAINER_STATES.includes(status);
}

function toContainerState(status: string): ContainerState {
  return isContainerState(status) ? status : "dead";
}

export interface DockerClientOptions {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: "http" | "https";
}

export class DockerClient implements SandboxProvider {
  private docker: Dockerode;

  constructor(options: DockerClientOptions = {}) {
    if (options.host) {
      this.docker = new Dockerode({
        host: options.host,
        port: options.port ?? 2375,
        protocol: options.protocol ?? "http",
      });
    } else {
      this.docker = new Dockerode({
        socketPath: options.socketPath ?? "/var/run/docker.sock",
      });
    }
  }

  get raw(): Dockerode {
    return this.docker;
  }

  async pullImage(
    ref: string,
    onProgress?: (event: { status: string; progress?: string }) => void,
  ): Promise<void> {
    const stream = await this.docker.pull(ref);

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        },
        onProgress,
      );
    });
  }

  async imageExists(ref: string): Promise<boolean> {
    try {
      await this.docker.getImage(ref).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async getImageWorkdir(ref: string): Promise<string> {
    const info = await this.docker.getImage(ref).inspect();
    return info.Config.WorkingDir || "/";
  }

  async getImageConfig(ref: string): Promise<{
    workdir: string;
    entrypoint: string[] | null;
    cmd: string[] | null;
  }> {
    const info = await this.docker.getImage(ref).inspect();
    const entrypoint = info.Config.Entrypoint;
    return {
      workdir: info.Config.WorkingDir || "/",
      entrypoint: typeof entrypoint === "string" ? [entrypoint] : entrypoint || null,
      cmd: info.Config.Cmd || null,
    };
  }

  async createContainer(options: ContainerCreateOptions): Promise<string> {
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, { HostPort: string }[]> = {};

    if (options.ports) {
      for (const port of options.ports) {
        const protocol = port.protocol ?? "tcp";
        const key = `${port.container}/${protocol}`;
        exposedPorts[key] = {};
        if (port.host !== undefined) {
          portBindings[key] = [{ HostPort: port.host.toString() }];
        } else {
          portBindings[key] = [{ HostPort: "" }];
        }
      }
    }

    const binds: string[] = [];
    if (options.volumes) {
      for (const vol of options.volumes) {
        const mode = vol.readonly ? "ro" : "rw";
        binds.push(`${vol.source}:${vol.target}:${mode}`);
      }
    }

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      Cmd: options.command,
      Entrypoint: options.entrypoint,
      WorkingDir: options.workdir,
      Hostname: options.hostname,
      Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
      Labels: options.labels,
      ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
        Binds: binds.length > 0 ? binds : undefined,
        NetworkMode: options.networkMode,
        Privileged: options.privileged,
      },
    });

    return container.id;
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string, timeout = 10): Promise<void> {
    try {
      await this.docker.getContainer(id).stop({ t: timeout });
    } catch (err) {
      if (!isNotRunningError(err)) throw err;
    }
  }

  async removeContainer(id: string, force = false): Promise<void> {
    try {
      await this.docker.getContainer(id).remove({ force });
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async restartContainer(id: string, timeout = 10): Promise<void> {
    await this.docker.getContainer(id).restart({ t: timeout });
  }

  async inspectContainer(id: string): Promise<ContainerInfo> {
    const info = await this.docker.getContainer(id).inspect();

    const ports: Record<number, number> = {};
    const portBindings = info.NetworkSettings.Ports;
    if (portBindings) {
      for (const [containerPort, bindings] of Object.entries(portBindings)) {
        if (!bindings?.[0]?.HostPort) continue;
        const port = parseInt(containerPort.split("/")[0]!, 10);
        ports[port] = parseInt(bindings[0].HostPort, 10);
      }
    }

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      status: info.State.Status,
      state: toContainerState(info.State.Status),
      ports,
      labels: info.Config.Labels ?? {},
    };
  }

  async waitContainer(id: string): Promise<ExitResult> {
    const result = await this.docker.getContainer(id).wait();
    return { exitCode: result.StatusCode };
  }

  async containerExists(id: string): Promise<boolean> {
    try {
      await this.docker.getContainer(id).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async *streamLogs(id: string, options: { tail?: number } = {}): AsyncGenerator<LogChunk> {
    const stream = await this.docker.getContainer(id).logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: options.tail,
    });

    let buffer = Buffer.alloc(0);

    for await (const chunk of stream) {
      const chunkBuffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffer = Buffer.concat([buffer, chunkBuffer]);

      while (buffer.length >= 8) {
        const streamType = buffer[0];
        const size = buffer.readUInt32BE(4);

        if (buffer.length < 8 + size) break;

        const frameData = buffer.subarray(8, 8 + size);
        buffer = buffer.subarray(8 + size);

        yield {
          stream: streamType === 1 ? "stdout" : "stderr",
          data: new Uint8Array(frameData),
        };
      }
    }
  }

  async createVolume(name: string, labels?: Record<string, string>): Promise<void> {
    await this.docker.createVolume({
      Name: name,
      Labels: labels,
    });
  }

  async removeVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).remove();
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async volumeExists(name: string): Promise<boolean> {
    try {
      await this.docker.getVolume(name).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async cloneVolume(source: string, target: string): Promise<void> {
    await this.createVolume(target);

    const containerId = await this.createContainer({
      image: "alpine:latest",
      command: ["sh", "-c", "cp -a /source/. /target/"],
      volumes: [
        { source, target: "/source", readonly: true },
        { source: target, target: "/target" },
      ],
    });

    try {
      await this.startContainer(containerId);
      const { exitCode } = await this.waitContainer(containerId);
      if (exitCode !== 0) {
        throw new Error(`Volume clone failed with exit code ${exitCode}`);
      }
    } finally {
      await this.removeContainer(containerId, true);
    }
  }

  async createNetwork(name: string, options: NetworkCreateOptions = {}): Promise<void> {
    await this.docker.createNetwork({
      Name: name,
      Driver: options.driver ?? "bridge",
      Labels: options.labels,
    });
  }

  async removeNetwork(name: string): Promise<void> {
    try {
      await this.docker.getNetwork(name).remove();
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async networkExists(name: string): Promise<boolean> {
    try {
      await this.docker.getNetwork(name).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async connectToNetwork(containerId: string, networkName: string): Promise<void> {
    await this.docker.getNetwork(networkName).connect({ Container: containerId });
  }

  async disconnectFromNetwork(containerId: string, networkName: string): Promise<void> {
    try {
      await this.docker.getNetwork(networkName).disconnect({ Container: containerId });
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }

  async exec(containerId: string, options: ExecOptions): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: options.command,
      WorkingDir: options.workdir,
      Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
      Tty: options.tty ?? false,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      let buffer = Buffer.alloc(0);

      stream.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Docker stream demuxing: 8-byte header per frame
        // Byte 0: stream type (1=stdout, 2=stderr)
        // Bytes 4-7: frame size (big-endian uint32)
        while (buffer.length >= 8) {
          const streamType = buffer[0];
          const size = buffer.readUInt32BE(4);

          if (buffer.length < 8 + size) break;

          const data = buffer.subarray(8, 8 + size);
          buffer = buffer.subarray(8 + size);

          if (streamType === 1) {
            stdout.push(data);
          } else if (streamType === 2) {
            stderr.push(data);
          }
        }
      });

      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const inspectResult = await exec.inspect();

    return {
      exitCode: inspectResult.ExitCode ?? 0,
      stdout: Buffer.concat(stdout).toString("utf-8"),
      stderr: Buffer.concat(stderr).toString("utf-8"),
    };
  }
}

function hasStatusCode(err: unknown): err is { statusCode: number } {
  return typeof err === "object" && err !== null && "statusCode" in err;
}

function isNotFoundError(err: unknown): boolean {
  return hasStatusCode(err) && err.statusCode === 404;
}

function isNotRunningError(err: unknown): boolean {
  return hasStatusCode(err) && err.statusCode === 304;
}
