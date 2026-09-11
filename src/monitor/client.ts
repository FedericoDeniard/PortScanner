import type { MonitorCommand, MonitorEvent, Protocol } from "./protocol"
import { createLineSplitter } from "./lines"

export type MonitorClientEvents = {
  event: MonitorEvent
  exit: number
  stderr: string
}

type Handler<T> = (payload: T) => void

function spawnMonitor(binPath: string) {
  return Bun.spawn([binPath], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

type MonitorProc = ReturnType<typeof spawnMonitor>

export class MonitorClient {
  private proc: MonitorProc
  private handlers = new Map<keyof MonitorClientEvents, Set<Handler<never>>>()
  private disposed = false

  private constructor(proc: MonitorProc) {
    this.proc = proc
  }

  static spawn(binPath: string): MonitorClient {
    const proc = spawnMonitor(binPath)
    const client = new MonitorClient(proc)
    void client.pumpStdout()
    void client.pumpStderr()
    void proc.exited.then((code) => {
      if (!client.disposed) client.emit("exit", code)
    })
    return client
  }

  on<K extends keyof MonitorClientEvents>(
    event: K,
    handler: Handler<MonitorClientEvents[K]>,
  ): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    const h = handler as Handler<never>
    set.add(h)
    return () => set.delete(h)
  }

  private emit<K extends keyof MonitorClientEvents>(
    event: K,
    payload: MonitorClientEvents[K],
  ) {
    const set = this.handlers.get(event)
    if (!set) return
    for (const h of set) (h as Handler<MonitorClientEvents[K]>)(payload)
  }

  private async pumpStdout() {
    const split = createLineSplitter((line) => {
      try {
        this.emit("event", JSON.parse(line) as MonitorEvent)
      } catch {
        this.emit("event", {
          type: "error",
          message: `invalid JSON from monitor: ${line.slice(0, 120)}`,
        })
      }
    })
    await this.pump(this.proc.stdout, split)
  }

  private async pumpStderr() {
    const split = createLineSplitter((line) => this.emit("stderr", line))
    await this.pump(this.proc.stderr, split)
  }

  private async pump(
    source: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void,
  ) {
    const decoder = new TextDecoder()
    const reader = source.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) onChunk(decoder.decode(value, { stream: true }))
      }
    } finally {
      reader.releaseLock()
    }
  }

  send(cmd: MonitorCommand) {
    if (this.disposed) return
    const sink = this.proc.stdin
    sink.write(JSON.stringify(cmd) + "\n")
    void sink.flush()
  }

  killProcess(pid: number, signal: "term" | "kill" = "term") {
    this.send({ cmd: "kill", pid, signal })
  }

  openTerminal(pid: number, cwd?: string) {
    this.send({ cmd: "open_terminal", pid, cwd })
  }

  setInterval(ms: number) {
    this.send({ cmd: "set_interval", ms })
  }

  setFilter(filter: { protocols?: Protocol[]; states?: string[] }) {
    this.send({ cmd: "set_filter", ...filter })
  }

  async dispose(timeoutMs = 1500) {
    if (this.disposed) return
    this.send({ cmd: "shutdown" })
    this.disposed = true
    const exited = await Promise.race([
      this.proc.exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ])
    if (!exited) this.proc.kill()
    this.handlers.clear()
  }
}
