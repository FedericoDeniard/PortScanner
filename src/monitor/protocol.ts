export type Protocol = "tcp" | "udp"

export type PortEntry = {
  protocol: Protocol
  localAddr: string
  localPort: number
  remoteAddr?: string
  remotePort?: number
  state?: string
  pid?: number
  processName?: string
}

export type MonitorEvent =
  | { type: "hello"; version: number; pid: number }
  | { type: "snapshot"; seq: number; ports: PortEntry[] }
  | { type: "delta"; seq: number; added: PortEntry[]; removed: PortEntry[] }
  | { type: "ack"; cmd: string; pid?: number; ok: boolean; error?: string }
  | { type: "error"; message: string }

export type MonitorCommand =
  | { cmd: "set_interval"; ms: number }
  | { cmd: "set_filter"; protocols?: Protocol[]; states?: string[] }
  | { cmd: "kill"; pid: number; signal?: "term" | "kill" }
  | { cmd: "shutdown" }

export const portKey = (p: PortEntry): string =>
  `${p.protocol}:${p.localPort}:${p.pid ?? "?"}`
