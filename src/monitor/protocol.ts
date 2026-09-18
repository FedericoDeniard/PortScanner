export type Protocol = "tcp" | "udp"

export type Category = "system" | "user-app" | "user-dev" | "container"

export type PortEntry = {
  protocol: Protocol
  localAddr: string
  localPort: number
  remoteAddr?: string
  remotePort?: number
  state?: string
  pid?: number
  processName?: string
  exe?: string
  cwd?: string
  parentPid?: number
  parentName?: string
  containerRuntime?: string
  containerId?: string
  containerName?: string
  containerImage?: string
  containerPort?: number
  cpuPercent?: number
  memoryBytes?: number
  category: Category
}

export type ContainerPort = {
  hostPort: number
  containerPort: number
  protocol: string
}

export type ContainerInfo = {
  id: string
  name: string
  image: string
  ports?: ContainerPort[]
}

export type SystemStats = {
  hostLabel: string
  chip: string
  gpuCores?: number
  totalMemoryBytes: number
  usedMemoryBytes: number
  totalDiskBytes: number
  usedDiskBytes: number
  osVersion: string
  batteryHealthPct?: number
  batteryChargePct?: number
  batteryState?: string
  uptimeSecs: number
  collectedAtMs: number
}

export type MonitorEvent =
  | { type: "hello"; version: number; pid: number }
  | { type: "snapshot"; seq: number; ports: PortEntry[] }
  | { type: "delta"; seq: number; added: PortEntry[]; removed: PortEntry[] }
  | { type: "portsupdated"; seq: number; ports: PortEntry[] }
  | { type: "ack"; cmd: string; pid?: number; ok: boolean; error?: string }
  | {
      type: "opened"
      pid: number
      ok: boolean
      terminal?: string
      error?: string
    }
  | { type: "error"; message: string }
  | { type: "stats"; stats: SystemStats }
  | { type: "containersupdated"; containers: ContainerInfo[] }

export type MonitorCommand =
  | { cmd: "set_interval"; ms: number }
  | { cmd: "set_filter"; protocols?: Protocol[]; states?: string[] }
  | { cmd: "kill"; pid: number; signal?: "term" | "kill" }
  | { cmd: "open_terminal"; pid: number; cwd?: string }
  | { cmd: "stop_container"; id: string }
  | { cmd: "shutdown" }

export const portKey = (p: PortEntry): string =>
  `${p.protocol}:${p.localPort}:${p.pid ?? "?"}`
