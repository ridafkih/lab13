import { Writable } from "node:stream";
import type { ExecOptions, ExecResult } from "@lab/sandbox-sdk";
import type Dockerode from "dockerode";

export class ExecOperations {
  private readonly docker: Dockerode;
  private readonly modem: Dockerode["modem"];

  constructor(docker: Dockerode) {
    this.docker = docker;
    this.modem = docker.modem;
  }

  async exec(containerId: string, options: ExecOptions): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);

    const execInstance = await container.exec({
      Cmd: options.command,
      WorkingDir: options.workdir,
      User: options.user,
      Env: options.env
        ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`)
        : undefined,
      Tty: options.tty ?? false,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];

    const stdoutStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        stdoutBuffers.push(chunk);
        callback();
      },
    });

    const stderrStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        stderrBuffers.push(chunk);
        callback();
      },
    });

    const execStream = await execInstance.start({});

    await new Promise<void>((resolve, reject) => {
      this.modem.demuxStream(execStream, stdoutStream, stderrStream);

      execStream.on("end", resolve);
      execStream.on("error", reject);
    });

    const inspectResult = await execInstance.inspect();

    return {
      exitCode: inspectResult.ExitCode ?? 0,
      stdout: Buffer.concat(stdoutBuffers).toString("utf-8"),
      stderr: Buffer.concat(stderrBuffers).toString("utf-8"),
    };
  }
}
