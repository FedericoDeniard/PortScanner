import { describe, expect, test } from "bun:test"
import type { PortEntry } from "./monitor/protocol"
import { groupPorts, ownerOf } from "./grouping"

const entry = (overrides: Partial<PortEntry>): PortEntry => ({
  protocol: "tcp",
  localAddr: "*",
  localPort: 8080,
  category: "user-dev",
  ...overrides,
})

describe("ownerOf", () => {
  test("prefers parentPid over self pid when present", () => {
    expect(
      ownerOf(entry({ pid: 100, processName: "Helper", parentPid: 1, parentName: "Launcher" })),
    ).toEqual({ pid: 1, name: "Launcher" })
  })

  test("falls back to self pid when no parentPid", () => {
    expect(ownerOf(entry({ pid: 100, processName: "node" }))).toEqual({
      pid: 100,
      name: "node",
    })
  })

  test("returns null when no pid at all", () => {
    expect(ownerOf(entry({ pid: undefined, processName: undefined }))).toBeNull()
  })

  test("falls back to processName when parentName missing", () => {
    expect(
      ownerOf(entry({ pid: 100, processName: "Helper", parentPid: 1 })),
    ).toEqual({ pid: 1, name: "Helper" })
  })
})

describe("groupPorts", () => {
  test("groups sockets sharing the same parent_pid", () => {
    const ports = [
      entry({ localPort: 5353, protocol: "udp", pid: 100, parentPid: 1, parentName: "App" }),
      entry({ localPort: 5354, protocol: "udp", pid: 100, parentPid: 1, parentName: "App" }),
      entry({ localPort: 3000, protocol: "tcp", pid: 200, parentPid: 2, parentName: "Other" }),
    ]
    const groups = groupPorts(ports)
    expect(groups).toHaveLength(2)
    expect(groups[0]!.name).toBe("App")
    expect(groups[0]!.children).toHaveLength(2)
    expect(groups[1]!.name).toBe("Other")
    expect(groups[1]!.children).toHaveLength(1)
  })

  test("children of same group are sorted by port then protocol", () => {
    const ports = [
      entry({ localPort: 9000, protocol: "tcp", pid: 1, parentPid: 1, parentName: "App" }),
      entry({ localPort: 5353, protocol: "udp", pid: 1, parentPid: 1, parentName: "App" }),
      entry({ localPort: 5353, protocol: "tcp", pid: 1, parentPid: 1, parentName: "App" }),
    ]
    const groups = groupPorts(ports)
    expect(groups[0]!.children.map((c) => [c.localPort, c.protocol])).toEqual([
      [5353, "tcp"],
      [5353, "udp"],
      [9000, "tcp"],
    ])
  })

  test("groups are sorted alphabetically by name", () => {
    const ports = [
      entry({ pid: 1, parentPid: 1, parentName: "Zeta" }),
      entry({ pid: 2, parentPid: 2, parentName: "Alpha" }),
      entry({ pid: 3, parentPid: 3, parentName: "Mu" }),
    ]
    expect(groupPorts(ports).map((g) => g.name)).toEqual(["Alpha", "Mu", "Zeta"])
  })

  test("ports without parent_pid group under their own pid", () => {
    const ports = [
      entry({ localPort: 3000, pid: 50, processName: "node" }),
      entry({ localPort: 3001, pid: 50, processName: "node" }),
    ]
    const groups = groupPorts(ports)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.pid).toBe(50)
    expect(groups[0]!.name).toBe("node")
  })

  test("drops entries without any pid or parent", () => {
    const ports = [
      entry({ pid: undefined, processName: undefined }),
      entry({ pid: 1, processName: "node" }),
    ]
    expect(groupPorts(ports)).toHaveLength(1)
  })

  test("group key is stable per pid", () => {
    const ports = [
      entry({ pid: 1, parentPid: 99, parentName: "App" }),
      entry({ pid: 2, parentPid: 99, parentName: "App" }),
    ]
    const groups = groupPorts(ports)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe("g:99")
    expect(groups[0]!.pid).toBe(99)
  })

  test("container entries group by containerId", () => {
    const ports: PortEntry[] = [
      entry({
        localPort: 8000,
        pid: 99,
        category: "container",
        containerId: "abc123",
        containerName: "kong",
        processName: "OrbStack Helper",
      }),
      entry({
        localPort: 5432,
        pid: 99,
        category: "container",
        containerId: "abc123",
        containerName: "kong",
        processName: "OrbStack Helper",
      }),
      entry({
        localPort: 9000,
        pid: 99,
        category: "container",
        containerId: "def456",
        containerName: "studio",
        processName: "OrbStack Helper",
      }),
    ]
    const groups = groupPorts(ports)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.key).sort()).toEqual(["c:abc123", "c:def456"])
    expect(groups.find((g) => g.key === "c:abc123")?.children).toHaveLength(2)
  })

  test("container entries without containerId fall back to pid key", () => {
    const ports: PortEntry[] = [
      entry({
        localPort: 8000,
        pid: 99,
        category: "container",
        processName: "OrbStack Helper",
      }),
      entry({
        localPort: 8001,
        pid: 99,
        category: "container",
        processName: "OrbStack Helper",
      }),
    ]
    const groups = groupPorts(ports)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe("g:99")
    expect(groups[0]!.name).toBe("pid:99 · OrbStack Helper")
  })
})
