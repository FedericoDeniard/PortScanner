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
  | "cpu"
  | "mem"
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
  { key: "cpu", label: "CPU%", width: 6 },
  { key: "mem", label: "RSS", width: 8 },
  { key: "addr", label: "LOCAL ADDR", width: 0 },
]

const CONTAINER_COLUMNS: ColumnSpec[] = [
  { key: "port", label: "PORT", width: 8 },
  { key: "proto", label: "PROTO", width: 6 },
  { key: "state", label: "STATE", width: 13 },
  { key: "pid", label: "PID", width: 7 },
  { key: "name", label: "NAME", width: 24 },
  { key: "image", label: "IMAGE", width: 40 },
  { key: "cpu", label: "CPU%", width: 6 },
  { key: "mem", label: "RSS", width: 8 },
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

export function mutedWidth(col: ColumnSpec): number {
  return Math.max(muteLabel(col.label).length, 1) + 1
}

export function renderCellText(
  port: PortEntry,
  col: ColumnSpec,
  muted: Set<ColumnKey>,
): string {
  if (muted.has(col.key)) return MUTED_PLACEHOLDER.padEnd(mutedWidth(col))
  return getCellValue(port, col.key, col.width)
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

export function formatCpuPercent(value: number | undefined, width: number): string {
  if (value == null || !Number.isFinite(value)) return "—".padEnd(width)
  const text = `${value.toFixed(1)}%`
  return text.padEnd(width)
}

export function formatBytesShort(value: number | undefined, width: number): string {
  if (value == null || !Number.isFinite(value)) return "—".padEnd(width)
  const units = ["B", "K", "M", "G", "T"]
  let scaled = value
  let unit = 0
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000
    unit += 1
  }
  const text = scaled >= 100 || unit === 0
    ? `${Math.round(scaled)}${units[unit]}`
    : scaled >= 10
      ? `${scaled.toFixed(1)}${units[unit]}`
      : `${scaled.toFixed(2)}${units[unit]}`
  return text.padEnd(width)
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
    case "cpu":
      return formatCpuPercent(port.cpuPercent, width)
    case "mem":
      return formatBytesShort(port.memoryBytes, width)
    case "addr":
      return port.localAddr
  }
}
