import { describe, expect, test } from "bun:test"
import {
  formatBytes,
  formatChipWithGpu,
  formatUptime,
  formatUsedFraction,
  HEALTH_THRESHOLD_LOW,
  HEALTH_THRESHOLD_OK,
  healthColor,
  healthLabel,
  usageColor,
  usageSpans,
  USAGE_THRESHOLD_HIGH,
  USAGE_THRESHOLD_WARN,
  type Span,
} from "./format"
import { colors } from "../theme"

describe("formatBytes", () => {
  test("zero", () => {
    expect(formatBytes(0)).toBe("0 B")
  })

  test("negative or NaN", () => {
    expect(formatBytes(-1)).toBe("—")
    expect(formatBytes(NaN)).toBe("—")
  })

  test("human-readable magnitudes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
    expect(formatBytes(8 * 1024 * 1024 * 1024)).toBe("8.0 GB")
    expect(formatBytes(228 * 1024 * 1024 * 1024)).toBe("228.0 GB")
    expect(formatBytes(2.5 * 1024 * 1024 * 1024 * 1024)).toBe("2.5 TB")
  })
})

describe("formatUptime", () => {
  test("days and hours", () => {
    expect(formatUptime(6 * 86400 + 22 * 3600)).toBe("6d 22h")
  })

  test("hours and minutes", () => {
    expect(formatUptime(3 * 3600 + 12 * 60)).toBe("3h 12m")
  })

  test("minutes only", () => {
    expect(formatUptime(45 * 60)).toBe("45m")
  })

  test("seconds only", () => {
    expect(formatUptime(30)).toBe("30s")
  })

  test("invalid", () => {
    expect(formatUptime(-1)).toBe("—")
    expect(formatUptime(NaN)).toBe("—")
  })
})

describe("healthColor", () => {
  test("undefined falls back to neutral", () => {
    expect(healthColor(undefined)).toBe(colors.base)
  })

  test("healthy range uses green", () => {
    expect(healthColor(HEALTH_THRESHOLD_OK)).toBe(colors.green)
    expect(healthColor(100)).toBe(colors.green)
  })

  test("degraded range uses yellow", () => {
    expect(healthColor(HEALTH_THRESHOLD_OK - 1)).toBe(colors.yellow)
    expect(healthColor(HEALTH_THRESHOLD_LOW)).toBe(colors.yellow)
  })

  test("low range uses red", () => {
    expect(healthColor(HEALTH_THRESHOLD_LOW - 1)).toBe(colors.red)
    expect(healthColor(0)).toBe(colors.red)
  })
})

describe("healthLabel", () => {
  test("returns null when healthy or undefined", () => {
    expect(healthLabel(undefined)).toBeNull()
    expect(healthLabel(HEALTH_THRESHOLD_OK)).toBeNull()
    expect(healthLabel(100)).toBeNull()
  })

  test("returns label when below threshold", () => {
    expect(healthLabel(HEALTH_THRESHOLD_OK - 1)).toBe("Battery health low")
    expect(healthLabel(HEALTH_THRESHOLD_LOW)).toBe("Battery health low")
    expect(healthLabel(0)).toBe("Battery health low")
  })
})

describe("formatChipWithGpu", () => {
  test("with gpu cores", () => {
    expect(formatChipWithGpu("Apple M1", 7)).toBe("Apple M1, 7GPU")
    expect(formatChipWithGpu("Apple M3 Pro", 18)).toBe("Apple M3 Pro, 18GPU")
  })

  test("without gpu cores", () => {
    expect(formatChipWithGpu("Apple M1", undefined)).toBe("Apple M1")
    expect(formatChipWithGpu("Apple M1", 0)).toBe("Apple M1")
  })

  test("empty chip", () => {
    expect(formatChipWithGpu("", 7)).toBe("—")
    expect(formatChipWithGpu("   ", 7)).toBe("—")
  })

  test("trims whitespace", () => {
    expect(formatChipWithGpu("  Apple M1  ", 7)).toBe("Apple M1, 7GPU")
  })
})

describe("formatUsedFraction", () => {
  test("ram: 6 of 8 GB", () => {
    expect(formatUsedFraction(6 * 1024 ** 3, 8 * 1024 ** 3)).toBe("6.0/8.0 GB")
  })

  test("disk: 125 of 256 GB", () => {
    expect(
      formatUsedFraction(125 * 1024 ** 3, 256 * 1024 ** 3),
    ).toBe("125.0/256.0 GB")
  })

  test("disk: 1.5 of 2 TB scales up to TB", () => {
    expect(
      formatUsedFraction(1.5 * 1024 ** 4, 2 * 1024 ** 4),
    ).toBe("1.5/2.0 TB")
  })

  test("bytes use whole numbers when both fit in B", () => {
    expect(formatUsedFraction(512, 768)).toBe("512/768 B")
  })

  test("both share the unit dictated by total", () => {
    expect(formatUsedFraction(512, 1024)).toBe("0.5/1.0 KB")
  })

  test("invalid used", () => {
    expect(formatUsedFraction(-1, 1024)).toBe("—")
    expect(formatUsedFraction(NaN, 1024)).toBe("—")
  })

  test("invalid total keeps used with dash", () => {
    expect(formatUsedFraction(1024, 0)).toBe("1.0 KB/—")
    expect(formatUsedFraction(1024, NaN)).toBe("1.0 KB/—")
  })
})

describe("usageColor", () => {
  test("undefined / invalid falls back to lavender", () => {
    expect(usageColor(undefined)).toBe(colors.lavender)
    expect(usageColor(NaN)).toBe(colors.lavender)
    expect(usageColor(-1)).toBe(colors.lavender)
  })

  test("below warn threshold is lavender", () => {
    expect(usageColor(0)).toBe(colors.lavender)
    expect(usageColor(USAGE_THRESHOLD_WARN - 0.01)).toBe(colors.lavender)
  })

  test("warn band is yellow", () => {
    expect(usageColor(USAGE_THRESHOLD_WARN)).toBe(colors.yellow)
    expect(usageColor(USAGE_THRESHOLD_HIGH - 0.01)).toBe(colors.yellow)
  })

  test("high band is red", () => {
    expect(usageColor(USAGE_THRESHOLD_HIGH)).toBe(colors.red)
    expect(usageColor(100)).toBe(colors.red)
  })
})

describe("usageSpans", () => {
  const collect = (spans: { text: string }[]) => spans.map((s) => s.text).join("")

  test("starts with label and brackets", () => {
    const out = usageSpans(0.5, 0, 1, "ram")
    expect(collect(out).startsWith("ram [")).toBe(true)
    expect(collect(out).endsWith("]")).toBe(true)
  })

  test("no block or outline characters — bar lives in text bg", () => {
    const out = usageSpans(0.5, 6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const decorative = out.filter(
      (s) => s.text === "█" || s.text === "░",
    )
    expect(decorative.length).toBe(0)
  })

  test("bar width equals text length", () => {
    const out = usageSpans(0.5, 6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const textChars = out.filter(
      (s) => s.text !== "ram " && s.text !== "[" && s.text !== "]",
    )
    expect(textChars.length).toBe("6.0/8.0 GB".length)
  })

  test("text characters appear inside the brackets", () => {
    const out = usageSpans(0.5, 6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const flat = collect(out)
    expect(flat).toContain("6.0/8.0 GB")
  })

  test("bar fill uses the usage color band", () => {
    const low = usageSpans(0.5, 4 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const warn = usageSpans(0.75, 6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const high = usageSpans(0.95, 7.6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const firstCell = (spans: Span[]) =>
      spans.find((s) => s.text.match(/[0-9]/) && s.bg !== colors.base)!
    expect(firstCell(low).bg).toBe(colors.lavender)
    expect(firstCell(warn).bg).toBe(colors.yellow)
    expect(firstCell(high).bg).toBe(colors.red)
  })

  test("text on filled cells uses dark base fg for high contrast", () => {
    const out = usageSpans(0.75, 6 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const textOnFilled = out.find(
      (s) => s.text === "6" && s.bg === colors.yellow,
    )
    expect(textOnFilled?.fg).toBe(colors.base)
  })

  test("text on empty cells uses bar color fg on base bg", () => {
    const out = usageSpans(0.4, 3 * 1024 ** 3, 8 * 1024 ** 3, "ram")
    const textOnEmpty = out.find(
      (s) => s.bg === colors.base && s.text !== "ram " && s.text !== "[" && s.text !== "]",
    )
    expect(textOnEmpty?.fg).toBe(colors.lavender)
  })

  test("clamps invalid percentages to empty bar", () => {
    const out = usageSpans(NaN, 0, 1024 ** 3, "ram")
    const onBar = out.find(
      (s) => s.text !== "ram " && s.text !== "[" && s.text !== "]",
    )
    expect(onBar?.bg).toBe(colors.base)
  })
})
