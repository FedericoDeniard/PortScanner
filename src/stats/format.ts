import { colors } from "../theme"

export const HEALTH_THRESHOLD_OK = 80
export const HEALTH_THRESHOLD_LOW = 50

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const exp = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / Math.pow(1024, exp)
  const unit = BYTE_UNITS[exp]
  if (exp === 0) return `${Math.round(value)} ${unit}`
  return `${value.toFixed(fractionDigits)} ${unit}`
}

export function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "—"
  const total = Math.floor(secs)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${total}s`
}

export function healthColor(pct: number | undefined): string {
  if (pct == null) return colors.base
  if (pct >= HEALTH_THRESHOLD_OK) return colors.green
  if (pct >= HEALTH_THRESHOLD_LOW) return colors.yellow
  return colors.red
}

export function healthLabel(pct: number | undefined): string | null {
  if (pct == null) return null
  if (pct < HEALTH_THRESHOLD_OK) return "Battery health low"
  return null
}

export function formatChipWithGpu(chip: string, gpuCores?: number): string {
  const trimmed = chip.trim()
  if (!trimmed) return "—"
  if (gpuCores != null && gpuCores > 0) {
    return `${trimmed}, ${gpuCores}GPU`
  }
  return trimmed
}
