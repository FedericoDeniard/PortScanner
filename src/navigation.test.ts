import { describe, expect, test } from "bun:test"
import type { PortEntry } from "./monitor/protocol"
import { groupPorts, type Group } from "./grouping"

const entry = (overrides: Partial<PortEntry>): PortEntry => ({
  protocol: "tcp",
  localAddr: "*",
  localPort: 8080,
  category: "user-dev",
  ...overrides,
})

type Row =
  | { kind: "header"; group: Group }
  | { kind: "child"; port: PortEntry; groupKey: string }

function buildRows(groups: Group[], collapsed: Set<string>): Row[] {
  const out: Row[] = []
  for (const g of groups) {
    out.push({ kind: "header", group: g })
    if (!collapsed.has(g.key)) {
      for (const c of g.children) {
        out.push({ kind: "child", port: c, groupKey: g.key })
      }
    }
  }
  return out
}

function simulateDown(selected: number, rows: Row[]): number {
  return Math.min(rows.length - 1, selected + 1)
}

function simulateUp(selected: number): number {
  return Math.max(0, selected - 1)
}

describe("navigation includes headers", () => {
  const groups = groupPorts([
    entry({ pid: 100, processName: "Helper A", parentPid: 1, parentName: "App A", localPort: 1001 }),
    entry({ pid: 100, processName: "Helper A", parentPid: 1, parentName: "App A", localPort: 1002 }),
    entry({ pid: 200, processName: "Helper B", parentPid: 2, parentName: "App B", localPort: 2001 }),
  ])
  const collapsed = new Set<string>()

  test("initial row is a header", () => {
    const rows = buildRows(groups, collapsed)
    const first = rows[0]!
    expect(first.kind).toBe("header")
    if (first.kind === "header") expect(first.group.name).toBe("App A")
  })

  test("down arrow from header lands on a child", () => {
    const rows = buildRows(groups, collapsed)
    const next = simulateDown(0, rows)
    expect(rows[next]!.kind).toBe("child")
  })

  test("up arrow from first child returns to header", () => {
    const rows = buildRows(groups, collapsed)
    const prev = simulateUp(1)
    expect(rows[prev]!.kind).toBe("header")
  })

  test("navigation reaches second group's header after scrolling through first group", () => {
    const rows = buildRows(groups, collapsed)
    let sel = 0
    sel = simulateDown(sel, rows)
    sel = simulateDown(sel, rows)
    sel = simulateDown(sel, rows)
    const row = rows[sel]!
    expect(row.kind).toBe("header")
    if (row.kind === "header") expect(row.group.name).toBe("App B")
  })

  test("collapsed header still navigable", () => {
    const collapsedSet = new Set([groups[1]!.key])
    const rows = buildRows(groups, collapsedSet)
    expect(rows[0]!.kind).toBe("header")
    expect(rows[1]!.kind).toBe("child")
    expect(rows[2]!.kind).toBe("child")
    const last = rows[3]!
    expect(last.kind).toBe("header")
    if (last.kind === "header") expect(last.group.name).toBe("App B")
  })

  test("can navigate up from collapsed header to expanded group above", () => {
    const collapsedSet = new Set([groups[0]!.key])
    const rows = buildRows(groups, collapsedSet)
    let sel = 1
    sel = simulateUp(sel)
    const target = rows[sel]!
    expect(target.kind).toBe("header")
    if (target.kind === "header") expect(target.group.name).toBe("App A")
  })

  test("can navigate down through all rows in order", () => {
    const rows = buildRows(groups, collapsed)
    const visited: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      if (r.kind === "header") visited.push(`H:${r.group.name}`)
      else visited.push(`C:${r.port.localPort}`)
    }
    expect(visited).toEqual([
      "H:App A",
      "C:1001",
      "C:1002",
      "H:App B",
      "C:2001",
    ])
  })

  test("can navigate down through collapsed rows", () => {
    const collapsedSet = new Set([groups[0]!.key])
    const rows = buildRows(groups, collapsedSet)
    const visited: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      if (r.kind === "header") visited.push(`H:${r.group.name}`)
      else visited.push(`C:${r.port.localPort}`)
    }
    expect(visited).toEqual(["H:App A", "H:App B", "C:2001"])
  })
})
