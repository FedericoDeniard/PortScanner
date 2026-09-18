import type { Category, PortEntry } from "./monitor/protocol"

export type ColumnKey =
  | "port"
  | "proto"
  | "state"
  | "pid"
  | "process"
  | "cwd"
  | "name"
  | "image"
  | "addr"

export type ColumnSpec = {
  key: ColumnKey
  label: string
  width: number
}

const PORT_COLUMNS: ColumnSpec[] = [
  { key: "port", label: "PORT", width: 8 },
  { key: "proto", label: "PROTO", width: 6 },
  { key: "state", label: "STATE", width: 13 },
  { key: "pid", label: "PID", width: 7 },
  { key: "process", label: "PROCESS", width: 24 },
  { key: "cwd", label: "CWD", width: 40 },
  { key: "addr", label: "LOCAL ADDR", width: 0 },
]

const CONTAINER_COLUMNS: ColumnSpec[] = [
  { key: "port", label: "PORT", width: 8 },
  { key: "proto", label: "PROTO", width: 6 },
  { key: "state", label: "STATE", width: 13 },
  { key: "pid", label: "PID", width: 7 },
  { key: "name", label: "NAME", width: 24 },
  { key: "image", label: "IMAGE", width: 40 },
  { key: "addr", label: "LOCAL ADDR", width: 0 },
]

export const COLUMN_LAYOUTS: Record<Category, ColumnSpec[]> = {
  "user-dev": PORT_COLUMNS,
  "user-app": PORT_COLUMNS,
  system: PORT_COLUMNS,
  container: CONTAINER_COLUMNS,
}

export const MUTED_PLACEHOLDER = "×"

export function muteLabel(label: string): string {
  return `~/${label}/~`
}

function truncateWithEllipsis(text: string, width: number): string {
  if (text.length <= width) return text
  return text.slice(0, width - 1) + "…"
}

function truncateTrailing(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width)
  return "…" + text.slice(text.length - (width - 1))
}

function truncateLeading(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width)
  return text.slice(0, width - 1) + "…"
}

function formatContainerLabel(p: PortEntry): string {
  if (p.containerPort != null) return `${p.localPort}→${p.containerPort}`
  return String(p.localPort)
}

export function getCellValue(port: PortEntry, key: ColumnKey, width: number): string {
  switch (key) {
    case "port":
      return (port.category === "container"
        ? formatContainerLabel(port)
        : String(port.localPort)
      ).padEnd(width || 0)
    case "proto":
      return port.protocol.padEnd(width)
    case "state":
      return (port.state ?? "—").padEnd(width)
    case "pid":
      return String(port.pid ?? "—").padEnd(width)
    case "process":
      return truncateLeading(port.processName ?? "—", width)
    case "cwd":
      return width ? truncateTrailing(port.cwd ?? "—", width) : (port.cwd ?? "—")
    case "name":
      return truncateWithEllipsis(
        port.containerName ?? port.processName ?? "container",
        width,
      )
    case "image":
      return width ? truncateTrailing(port.containerImage ?? "—", width) : (port.containerImage ?? "—")
    case "addr":
      return port.localAddr
  }
}
