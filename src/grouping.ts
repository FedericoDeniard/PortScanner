import type { PortEntry } from "./monitor/protocol"

export type Group = {
  key: string
  pid: number
  name: string
  children: PortEntry[]
}

export function ownerOf(p: PortEntry): { pid: number; name: string } | null {
  if (p.category === "container") {
    const id = p.containerId ?? `pid:${p.pid ?? "?"}`
    const name = p.containerName ?? p.processName ?? p.parentName ?? "container"
    return { pid: p.pid ?? 0, name: `${id} · ${name}` }
  }
  if (p.parentPid != null) {
    return { pid: p.parentPid, name: p.parentName ?? p.processName ?? "—" }
  }
  if (p.pid != null) return { pid: p.pid, name: p.processName ?? "—" }
  return null
}

export function groupPorts(ports: PortEntry[]): Group[] {
  const map = new Map<string, Group>()
  for (const p of ports) {
    const owner = ownerOf(p)
    if (!owner) continue
    const key =
      p.category === "container" && p.containerId
        ? `c:${p.containerId}`
        : `g:${owner.pid}`
    let g = map.get(key)
    if (!g) {
      g = { key, pid: owner.pid, name: owner.name, children: [] }
      map.set(key, g)
    }
    g.children.push(p)
  }
  for (const g of map.values()) {
    g.children.sort(
      (a, b) => a.localPort - b.localPort || a.protocol.localeCompare(b.protocol),
    )
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}
