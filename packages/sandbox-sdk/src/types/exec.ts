export interface ExecOptions {
  command: string[];
  workdir?: string;
  env?: Record<string, string>;
  tty?: boolean;
  user?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
