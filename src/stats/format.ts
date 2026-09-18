import { colors } from "../theme"

export const HEALTH_THRESHOLD_OK = 80
export const HEALTH_THRESHOLD_LOW = 50

export const USAGE_THRESHOLD_WARN = 70
export const USAGE_THRESHOLD_HIGH = 90

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

export function formatUsedFraction(used: number, total: number): string {
  if (!Number.isFinite(used) || used < 0) return "—"
  if (!Number.isFinite(total) || total <= 0) {
    return `${formatBytes(used)}/—`
  }
  const exp = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(total) / Math.log(1024)),
  )
  const unit = BYTE_UNITS[exp]
  const usedValue = used / Math.pow(1024, exp)
  const totalValue = total / Math.pow(1024, exp)
  if (exp === 0) {
    return `${Math.round(usedValue)}/${Math.round(totalValue)} ${unit}`
  }
  return `${usedValue.toFixed(1)}/${totalValue.toFixed(1)} ${unit}`
}

export function usageColor(pct: number | undefined): string {
  if (pct == null || !Number.isFinite(pct) || pct < 0) return colors.lavender
  if (pct >= USAGE_THRESHOLD_HIGH) return colors.red
  if (pct >= USAGE_THRESHOLD_WARN) return colors.yellow
  return colors.lavender
}

export type Span = { text: string; fg: string; bg?: string }

export function usageSpans(
  pct: number,
  used: number,
  total: number,
  label: string,
): Span[] {
  const text = formatUsedFraction(used, total)
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0
  const barColor = usageColor(safePct * 100)
  const filled = Math.round(safePct * text.length)

  const spans: Span[] = [
    { text: `${label} `, fg: colors.base },
    { text: "[", fg: barColor },
  ]

  for (let i = 0; i < text.length; i++) {
    const cellFilled = i < filled
    spans.push({
      text: text[i]!,
      fg: cellFilled ? colors.base : barColor,
      bg: cellFilled ? barColor : colors.base,
    })
  }

  spans.push({ text: "]", fg: barColor })
  return spans
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
