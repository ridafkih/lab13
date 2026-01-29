export interface ContainerCreateOptions {
  image: string
  name?: string
  command?: string[]
  entrypoint?: string[]
  workdir?: string
  env?: Record<string, string>
  labels?: Record<string, string>
  hostname?: string
  ports?: PortMapping[]
  volumes?: VolumeBinding[]
  networkMode?: string
  privileged?: boolean
}

export interface PortMapping {
  container: number
  host?: number
  protocol?: "tcp" | "udp"
}

export interface VolumeBinding {
  source: string
  target: string
  readonly?: boolean
}

export type ContainerState =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead"

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: ContainerState
  ports: Record<number, number>
  labels: Record<string, string>
}

export interface ExitResult {
  exitCode: number
}

export interface LogChunk {
  stream: "stdout" | "stderr"
  data: Uint8Array
}

export interface NetworkCreateOptions {
  driver?: string
  labels?: Record<string, string>
}

export interface SandboxProvider {
  pullImage(
    ref: string,
    onProgress?: (event: { status: string; progress?: string }) => void
  ): Promise<void>
  imageExists(ref: string): Promise<boolean>

  createContainer(options: ContainerCreateOptions): Promise<string>
  startContainer(id: string): Promise<void>
  stopContainer(id: string, timeout?: number): Promise<void>
  removeContainer(id: string, force?: boolean): Promise<void>
  restartContainer(id: string, timeout?: number): Promise<void>
  inspectContainer(id: string): Promise<ContainerInfo>
  waitContainer(id: string): Promise<ExitResult>
  containerExists(id: string): Promise<boolean>
  streamLogs(id: string, options?: { tail?: number }): AsyncGenerator<LogChunk>

  createVolume(name: string, labels?: Record<string, string>): Promise<void>
  removeVolume(name: string): Promise<void>
  volumeExists(name: string): Promise<boolean>
  cloneVolume(source: string, target: string): Promise<void>

  createNetwork(name: string, options?: NetworkCreateOptions): Promise<void>
  removeNetwork(name: string): Promise<void>
  networkExists(name: string): Promise<boolean>
  connectToNetwork(containerId: string, networkName: string): Promise<void>
  disconnectFromNetwork(containerId: string, networkName: string): Promise<void>
}

export interface PortAllocator {
  allocate(count?: number): Promise<number[]>
  release(port: number): void
  releaseAll(ports: number[]): void
  isAllocated(port: number): boolean
}

export interface PortAllocatorOptions {
  minPort?: number
  maxPort?: number
}
