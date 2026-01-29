import { createServer } from "net"
import type {
  PortAllocator as IPortAllocator,
  PortAllocatorOptions,
} from "@lab/sdk"

export class PortAllocator implements IPortAllocator {
  private minPort: number
  private maxPort: number
  private allocated = new Set<number>()

  constructor(options: PortAllocatorOptions = {}) {
    this.minPort = options.minPort ?? 32768
    this.maxPort = options.maxPort ?? 60999
  }

  async allocate(count = 1): Promise<number[]> {
    const ports: number[] = []

    for (let i = 0; i < count; i++) {
      const port = await this.findAvailablePort()
      this.allocated.add(port)
      ports.push(port)
    }

    return ports
  }

  release(port: number): void {
    this.allocated.delete(port)
  }

  releaseAll(ports: number[]): void {
    for (const port of ports) {
      this.allocated.delete(port)
    }
  }

  isAllocated(port: number): boolean {
    return this.allocated.has(port)
  }

  private async findAvailablePort(): Promise<number> {
    for (let port = this.minPort; port <= this.maxPort; port++) {
      if (this.allocated.has(port)) continue

      const available = await this.isPortAvailable(port)
      if (available) return port
    }

    throw new Error(
      `No available ports in range ${this.minPort}-${this.maxPort}`
    )
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()

      server.once("error", () => {
        resolve(false)
      })

      server.once("listening", () => {
        server.close(() => resolve(true))
      })

      server.listen(port, "127.0.0.1")
    })
  }
}
