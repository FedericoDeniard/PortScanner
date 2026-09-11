import { describe, expect, test } from "bun:test"
import { portsReducer, type PortsState } from "./store"
import type { Category, PortEntry } from "./monitor/protocol"

const entry = (
  port: number,
  pid: number,
  protocol: "tcp" | "udp" = "tcp",
  category: Category = "user-dev",
): PortEntry => ({
  protocol,
  localAddr: "*",
  localPort: port,
  state: "LISTEN",
  pid,
  category,
})

const base: PortsState = { ports: [], status: "connecting", seq: 0 }

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
})
