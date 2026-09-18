import { describe, expect, test } from "bun:test"
import {
  applyContainerEnrichment,
  portsReducer,
  type PortsState,
} from "./store"
import type { Category, ContainerInfo, PortEntry } from "./monitor/protocol"

const entry = (
  port: number,
  pid: number,
  protocol: "tcp" | "udp" = "tcp",
  category: Category = "user-dev",
  overrides: Partial<PortEntry> = {},
): PortEntry => ({
  protocol,
  localAddr: "*",
  localPort: port,
  state: "LISTEN",
  pid,
  category,
  ...overrides,
})

const base: PortsState = {
  ports: [],
  status: "connecting",
  seq: 0,
  containers: [],
}

describe("portsReducer", () => {
  test("READY flips status and clears error", () => {
    const errored: PortsState = { ...base, status: "error", error: "boom" }
    const next = portsReducer(errored, { type: "READY" })
    expect(next.status).toBe("ready")
    expect(next.error).toBeUndefined()
  })

  test("SNAPSHOT replaces ports, sorted by port", () => {
    const next = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(8080, 2), entry(3000, 1)],
    })
    expect(next.status).toBe("ready")
    expect(next.seq).toBe(1)
    expect(next.ports.map((p) => p.localPort)).toEqual([3000, 8080])
  })

  test("DELTA removes by key and merges added, keeping sort", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1), entry(8080, 2)],
    })
    const next = portsReducer(withPorts, {
      type: "DELTA",
      seq: 2,
      added: [entry(5432, 3)],
      removed: [entry(3000, 1)],
    })
    expect(next.ports.map((p) => p.localPort)).toEqual([5432, 8080])
    expect(next.seq).toBe(2)
  })

  test("DELTA with pid change removes old entry", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1)],
    })
    const next = portsReducer(withPorts, {
      type: "DELTA",
      seq: 2,
      added: [entry(3000, 9)],
      removed: [entry(3000, 1)],
    })
    expect(next.ports).toHaveLength(1)
    expect(next.ports[0]!.pid).toBe(9)
  })

  test("DELTA does not touch entries with different protocol", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(5353, 1, "udp")],
    })
    const next = portsReducer(withPorts, {
      type: "DELTA",
      seq: 2,
      added: [],
      removed: [entry(5353, 1, "tcp")],
    })
    expect(next.ports).toHaveLength(1)
    expect(next.ports[0]!.protocol).toBe("udp")
  })

  test("ERROR sets status and message", () => {
    const next = portsReducer(base, { type: "ERROR", error: "monitor died" })
    expect(next.status).toBe("error")
    expect(next.error).toBe("monitor died")
  })

  test("NOTICE sets transient message without changing status", () => {
    const ready = portsReducer(base, { type: "READY" })
    const next = portsReducer(ready, { type: "NOTICE", notice: "kill failed" })
    expect(next.status).toBe("ready")
    expect(next.notice).toBe("kill failed")
  })

  test("DELTA preserves entries across different categories", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [
        entry(3000, 1, "tcp", "user-dev"),
        entry(5353, 2, "udp", "user-app"),
        entry(7000, 3, "tcp", "system"),
      ],
    })
    const next = portsReducer(withPorts, {
      type: "DELTA",
      seq: 2,
      added: [entry(8080, 4, "tcp", "system")],
      removed: [entry(3000, 1, "tcp", "user-dev")],
    })
    expect(next.ports.map((p) => [p.localPort, p.category])).toEqual([
      [5353, "user-app"],
      [7000, "system"],
      [8080, "system"],
    ])
  })

  test("PORTS_UPDATED merges resource fields in-place and preserves sort", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1), entry(8080, 2)],
    })
    const next = portsReducer(withPorts, {
      type: "PORTS_UPDATED",
      seq: 2,
      ports: [
        { ...entry(3000, 1), cpuPercent: 12.3, memoryBytes: 124_000_000 },
        { ...entry(8080, 2), cpuPercent: 0.5, memoryBytes: 9_000_000 },
      ],
    })
    expect(next.seq).toBe(2)
    expect(next.ports).toHaveLength(2)
    expect(next.ports[0]).toMatchObject({
      localPort: 3000,
      cpuPercent: 12.3,
      memoryBytes: 124_000_000,
    })
    expect(next.ports[1]).toMatchObject({
      localPort: 8080,
      cpuPercent: 0.5,
      memoryBytes: 9_000_000,
    })
  })

  test("PORTS_UPDATED keeps entries not present in the update untouched", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1), entry(8080, 2)],
    })
    const next = portsReducer(withPorts, {
      type: "PORTS_UPDATED",
      seq: 2,
      ports: [{ ...entry(3000, 1), cpuPercent: 5 }],
    })
    expect(next.ports).toHaveLength(2)
    expect(next.ports[1]).toEqual(entry(8080, 2))
  })

  test("PORTS_UPDATED adds entries that are new since the last snapshot", () => {
    const withPorts = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1)],
    })
    const next = portsReducer(withPorts, {
      type: "PORTS_UPDATED",
      seq: 2,
      ports: [entry(3000, 1), entry(5432, 9, "tcp", "user-app")],
    })
    expect(next.ports.map((p) => p.localPort)).toEqual([3000, 5432])
  })

  test("CONTAINERS_UPDATED enriches existing container entries by host port", () => {
    const snapshot = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [
        entry(8000, 99, "tcp", "container", {
          processName: "OrbStack Helper",
          containerRuntime: "orbstack",
        }),
      ],
    })
    const containers: ContainerInfo[] = [
      {
        id: "abc123def456",
        name: "supabase_kong",
        image: "kong:2.8.1",
        ports: [{ hostPort: 8000, containerPort: 8000, protocol: "tcp" }],
      },
    ]
    const next = portsReducer(snapshot, {
      type: "CONTAINERS_UPDATED",
      containers,
    })
    expect(next.containers).toEqual(containers)
    expect(next.ports[0]).toMatchObject({
      containerId: "abc123def456",
      containerName: "supabase_kong",
      containerImage: "kong:2.8.1",
      containerPort: 8000,
    })
  })

  test("CONTAINERS_UPDATED leaves non-container entries alone", () => {
    const snapshot = portsReducer(base, {
      type: "SNAPSHOT",
      seq: 1,
      ports: [entry(3000, 1, "tcp", "user-dev")],
    })
    const next = portsReducer(snapshot, {
      type: "CONTAINERS_UPDATED",
      containers: [
        {
          id: "abc",
          name: "n",
          image: "i",
          ports: [{ hostPort: 3000, containerPort: 3000, protocol: "tcp" }],
        },
      ],
    })
    expect(next.ports[0]).not.toHaveProperty("containerId")
  })
})

describe("applyContainerEnrichment", () => {
  test("returns ports unchanged when no containers known", () => {
    const ports: PortEntry[] = [
      entry(8000, 1, "tcp", "container"),
    ]
    expect(applyContainerEnrichment([], ports)).toBe(ports)
  })

  test("matches by host port and protocol", () => {
    const ports: PortEntry[] = [
      entry(8000, 1, "tcp", "container"),
    ]
    const out = applyContainerEnrichment(
      [
        {
          id: "abc123def456",
          name: "kong",
          image: "kong:2.8.1",
          ports: [{ hostPort: 8000, containerPort: 8000, protocol: "tcp" }],
        },
      ],
      ports,
    )
    expect(out[0]?.containerId).toBe("abc123def456")
    expect(out[0]?.containerName).toBe("kong")
    expect(out[0]?.containerPort).toBe(8000)
  })

  test("matches on container id prefix (short id from server vs full)", () => {
    const ports: PortEntry[] = [
      entry(5432, 1, "tcp", "container", {
        containerId: "abc123def456",
        containerName: "kong",
      }),
    ]
    const out = applyContainerEnrichment(
      [
        {
          id: "abc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890",
          name: "kong",
          image: "kong:2.8.1",
          ports: [{ hostPort: 5432, containerPort: 5432, protocol: "tcp" }],
        },
      ],
      ports,
    )
    expect(out[0]?.containerImage).toBe("kong:2.8.1")
  })
})
