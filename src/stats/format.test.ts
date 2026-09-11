import { describe, expect, test } from "bun:test"
import {
  formatBytes,
  formatChipWithGpu,
  formatUptime,
  HEALTH_THRESHOLD_LOW,
  HEALTH_THRESHOLD_OK,
  healthColor,
  healthLabel,
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
