import { describe, expect, test } from "bun:test"
import type { PortEntry } from "./monitor/protocol"
import {
  COLUMN_LAYOUTS,
  getCellValue,
  MUTED_PLACEHOLDER,
  muteLabel,
  mutedWidth,
  renderCellText,
  type ColumnSpec,
} from "./columns"

const baseEntry = (overrides: Partial<PortEntry> = {}): PortEntry => ({
  protocol: "tcp",
  localAddr: "127.0.0.1",
  localPort: 8080,
  pid: 42,
  processName: "node",
  category: "user-dev",
  ...overrides,
})

describe("muteLabel", () => {
  test("wraps the label with strikethrough characters", () => {
    expect(muteLabel("PORT")).toBe("~/PORT/~")
    expect(muteLabel("PID")).toBe("~/PID/~")
    expect(muteLabel("LOCAL ADDR")).toBe("~/LOCAL ADDR/~")
  })
})

describe("MUTED_PLACEHOLDER", () => {
  test("is the off character", () => {
    expect(MUTED_PLACEHOLDER).toBe("×")
  })
})

describe("mutedWidth", () => {
  test("matches the wrapped label length plus one separator", () => {
    expect(mutedWidth({ key: "port", label: "PORT", width: 8 })).toBe(9)
    expect(mutedWidth({ key: "pid", label: "PID", width: 7 })).toBe(8)
    expect(mutedWidth({ key: "state", label: "STATE", width: 13 })).toBe(10)
    expect(mutedWidth({ key: "process", label: "PROCESS", width: 24 })).toBe(12)
    expect(mutedWidth({ key: "cwd", label: "CWD", width: 40 })).toBe(8)
    expect(mutedWidth({ key: "addr", label: "LOCAL ADDR", width: 0 })).toBe(15)
  })
})

describe("renderCellText", () => {
  const col = (overrides: Partial<ColumnSpec> = {}): ColumnSpec => ({
    key: "state",
    label: "STATE",
    width: 13,
    ...overrides,
  })

  test("muted cells pad to mutedWidth so they align with muted headers", () => {
    const port = baseEntry()
    const muted = new Set<ColumnSpec["key"]>([
      "port",
      "proto",
      "state",
      "pid",
      "process",
      "cwd",
    ])
    expect(
      renderCellText(port, col({ key: "port", label: "PORT", width: 8 }), muted),
    ).toBe(MUTED_PLACEHOLDER.padEnd(9))
    expect(
      renderCellText(
        port,
        col({ key: "proto", label: "PROTO", width: 6 }),
        muted,
      ),
    ).toBe(MUTED_PLACEHOLDER.padEnd(10))
    expect(
      renderCellText(
        port,
        col({ key: "state", label: "STATE", width: 13 }),
        muted,
      ),
    ).toBe(MUTED_PLACEHOLDER.padEnd(10))
    expect(
      renderCellText(port, col({ key: "pid", label: "PID", width: 7 }), muted),
    ).toBe(MUTED_PLACEHOLDER.padEnd(8))
    expect(
      renderCellText(
        port,
        col({ key: "process", label: "PROCESS", width: 24 }),
        muted,
      ),
    ).toBe(MUTED_PLACEHOLDER.padEnd(12))
    expect(
      renderCellText(port, col({ key: "cwd", label: "CWD", width: 40 }), muted),
    ).toBe(MUTED_PLACEHOLDER.padEnd(8))
  })

  test("muted flex-width addr column also pads to mutedWidth", () => {
    const port = baseEntry()
    const muted = new Set<ColumnSpec["key"]>(["addr"])
    expect(
      renderCellText(
        port,
        col({ key: "addr", label: "LOCAL ADDR", width: 0 }),
        muted,
      ),
    ).toBe(MUTED_PLACEHOLDER.padEnd(15))
  })

  test("non-muted columns fall through to getCellValue", () => {
    const port = baseEntry({ localPort: 3000 })
    const muted = new Set<ColumnSpec["key"]>()
    expect(renderCellText(port, col({ key: "port", width: 8 }), muted)).toBe(
      "3000    ",
    )
  })
})

describe("COLUMN_LAYOUTS", () => {
  test("user tabs share the same port-centric columns", () => {
    const userDev = COLUMN_LAYOUTS["user-dev"]
    const userApp = COLUMN_LAYOUTS["user-app"]
    const system = COLUMN_LAYOUTS.system
    expect(userDev.map((c) => c.key)).toEqual([
      "port",
      "proto",
      "state",
      "pid",
      "process",
      "cwd",
      "cpu",
      "mem",
      "addr",
    ])
    expect(userApp.map((c) => c.key)).toEqual(userDev.map((c) => c.key))
    expect(system.map((c) => c.key)).toEqual(userDev.map((c) => c.key))
  })

  test("container layout uses name and image instead of process and cwd", () => {
    expect(COLUMN_LAYOUTS.container.map((c) => c.key)).toEqual([
      "port",
      "proto",
      "state",
      "pid",
      "name",
      "image",
      "cpu",
      "mem",
      "addr",
    ])
  })

  test("shared columns have identical widths across layouts", () => {
    const userDev = COLUMN_LAYOUTS["user-dev"]
    const container = COLUMN_LAYOUTS.container
    for (const key of ["port", "proto", "state", "pid", "cpu", "mem", "addr"] as const) {
      const userWidth = userDev.find((c) => c.key === key)!.width
      const containerWidth = container.find((c) => c.key === key)!.width
      expect(containerWidth).toBe(userWidth)
    }
    expect(container.find((c) => c.key === "name")!.width).toBe(
      userDev.find((c) => c.key === "process")!.width,
    )
    expect(container.find((c) => c.key === "image")!.width).toBe(
      userDev.find((c) => c.key === "cwd")!.width,
    )
  })

  test("addr is the only flex-width column", () => {
    const flexColumns = COLUMN_LAYOUTS["user-dev"].filter((c) => c.width === 0)
    expect(flexColumns.map((c) => c.key)).toEqual(["addr"])
  })
})

describe("getCellValue", () => {
  test("pads fixed-width columns", () => {
    const port = baseEntry({ localPort: 3000 })
    expect(getCellValue(port, "port", 8)).toBe("3000    ")
    expect(getCellValue(port, "proto", 6)).toBe("tcp   ")
    expect(getCellValue(port, "state", 13)).toBe("—".padEnd(13))
    expect(getCellValue(port, "pid", 7)).toBe("42     ")
  })

  test("uses — for missing pid", () => {
    const port = baseEntry({ pid: undefined })
    expect(getCellValue(port, "pid", 7)).toBe("—".padEnd(7))
  })

  test("process pads to its width", () => {
    const port = baseEntry({ processName: "node" })
    expect(getCellValue(port, "process", 24)).toBe("node".padEnd(24))
  })

  test("cwd truncates with leading ellipsis when too long", () => {
    const cwd = "/" + "x".repeat(50)
    const port = baseEntry({ cwd })
    expect(getCellValue(port, "cwd", 40)).toBe("…" + "x".repeat(39))
  })

  test("cwd pads short paths", () => {
    const port = baseEntry({ cwd: "/Users/me" })
    expect(getCellValue(port, "cwd", 40)).toBe("/Users/me".padEnd(40))
  })

  test("cwd shows — when missing", () => {
    const port = baseEntry({ cwd: undefined })
    expect(getCellValue(port, "cwd", 40)).toBe("—".padEnd(40))
  })

  test("container port uses arrow notation when containerPort is set", () => {
    const port = baseEntry({
      category: "container",
      localPort: 8080,
      containerPort: 80,
    })
    expect(getCellValue(port, "port", 8)).toBe("8080→80 ")
  })

  test("container name falls back through containerName → processName → 'container'", () => {
    expect(getCellValue(baseEntry({ category: "container", containerName: "kong", processName: "OrbStack" }), "name", 24)).toBe("kong")
    expect(getCellValue(baseEntry({ category: "container", containerName: undefined, processName: "OrbStack" }), "name", 24)).toBe("OrbStack")
    expect(getCellValue(baseEntry({ category: "container", containerName: undefined, processName: undefined }), "name", 24)).toBe("container")
  })

  test("container name truncates with trailing ellipsis when too long", () => {
    const port = baseEntry({
      category: "container",
      containerName: "a".repeat(40),
    })
    expect(getCellValue(port, "name", 24)).toBe("a".repeat(23) + "…")
  })

  test("container image pads or truncates with leading ellipsis", () => {
    const port = baseEntry({
      category: "container",
      containerImage: "nginx:1.25",
    })
    expect(getCellValue(port, "image", 40)).toBe("nginx:1.25".padEnd(40))

    const longImage = baseEntry({
      category: "container",
      containerImage: "/" + "x".repeat(50),
    })
    expect(getCellValue(longImage, "image", 40)).toBe("…" + "x".repeat(39))
  })

  test("addr is rendered without padding", () => {
    const port = baseEntry({ localAddr: "0.0.0.0" })
    expect(getCellValue(port, "addr", 0)).toBe("0.0.0.0")
  })

  test("cpu shows one decimal with percent and pads", () => {
    expect(getCellValue(baseEntry({ cpuPercent: 12.3 }), "cpu", 6)).toBe("12.3% ".padEnd(6))
    expect(getCellValue(baseEntry({ cpuPercent: 100 }), "cpu", 6)).toBe("100.0%".padEnd(6))
  })

  test("cpu shows em-dash when undefined", () => {
    expect(getCellValue(baseEntry(), "cpu", 6)).toBe("—".padEnd(6))
    expect(getCellValue(baseEntry({ cpuPercent: 0 }), "cpu", 6)).toBe("0.0%  ".padEnd(6))
  })

  test("mem formats decimal short across magnitudes", () => {
    expect(getCellValue(baseEntry({ memoryBytes: 0 }), "mem", 8)).toBe("0B      ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 999 }), "mem", 8)).toBe("999B    ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 1_500 }), "mem", 8)).toBe("1.50K   ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 12_000 }), "mem", 8)).toBe("12.0K   ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 124_000_000 }), "mem", 8)).toBe("124M    ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 1_500_000_000 }), "mem", 8)).toBe("1.50G   ".padEnd(8))
    expect(getCellValue(baseEntry({ memoryBytes: 12_000_000_000 }), "mem", 8)).toBe("12.0G   ".padEnd(8))
  })

  test("mem shows em-dash when undefined", () => {
    expect(getCellValue(baseEntry(), "mem", 8)).toBe("—".padEnd(8))
  })
})
