import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { dirname, join } from "node:path"
import { useEffect, useMemo, useRef, useState } from "react"
import { MonitorProvider, usePorts } from "./src/store"
import { portKey, type Category, type PortEntry } from "./src/monitor/protocol"
import { groupPorts, ownerOf, type Group } from "./src/grouping"
import { colors } from "./src/theme"
import { PixelCat } from "./src/mascot/PixelCat"
import {
  formatChipWithGpu,
  formatUptime,
  usageSpans,
  type Span,
} from "./src/stats/format"

const STATUS_COLOR = {
  connecting: colors.yellow,
  ready: colors.green,
  error: colors.red,
} as const

const TAB_ORDER: Category[] = ["user-dev", "user-app", "container", "system"]

const TAB_META: Record<Category, { label: string; hint: string }> = {
  "user-dev": { label: "Dev", hint: "started by the user" },
  "user-app": { label: "Apps", hint: "apps running in background" },
  container: { label: "Containers", hint: "ports forwarded by a runtime" },
  system: { label: "System", hint: "macOS — do not touch" },
}

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

function stateColor(state?: string): string {
  switch (state) {
    case "LISTEN":
      return colors.green
    case "ESTABLISHED":
      return colors.blue
    case "TIME_WAIT":
    case "CLOSE_WAIT":
      return colors.yellow
    default:
      return colors.lavender
  }
}

function formatRow(p: PortEntry) {
  return {
    port: String(p.localPort).padEnd(8),
    proto: p.protocol.padEnd(6),
    state: (p.state ?? "—").padEnd(13),
    pid: String(p.pid ?? "—").padEnd(7),
    process: (p.processName ?? "—").padEnd(20),
    cwd: truncateCwd(p.cwd),
    addr: p.localAddr,
  }
}

function formatContainerLabel(p: PortEntry): string {
  if (p.containerPort != null) {
    return `${p.localPort}→${p.containerPort}`
  }
  return String(p.localPort)
}

function truncateCwd(cwd: string | undefined, max = 40): string {
  if (!cwd) return "—".padEnd(max)
  if (cwd.length <= max) return cwd.padEnd(max)
  return "…" + cwd.slice(cwd.length - (max - 1))
}

type Segment = { spans: Span[]; dropRank?: number }

const SEP = " · "
const CHROME_WIDTH = 6

function lineLength(segments: Segment[]): number {
  let len = 0
  for (const s of segments) {
    for (const sp of s.spans) len += sp.text.length
  }
  return len + Math.max(0, segments.length - 1) * SEP.length
}

function fitSegments(segments: Segment[], budget: number): Span[][] {
  const kept = [...segments]
  while (lineLength(kept) > budget) {
    const droppable = kept
      .map((s, i) => ({ rank: s.dropRank, i }))
      .filter((x): x is { rank: number; i: number } => x.rank != null)
      .sort((a, b) => a.rank - b.rank)[0]
    if (!droppable) break
    kept.splice(droppable.i, 1)
  }
  return kept.map((s) => s.spans)
}

function StatusLine({ segments }: { segments: Span[][] }) {
  const spans: Span[] = []
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) spans.push({ text: SEP, fg: colors.base })
    spans.push(...segments[i]!)
  }
  return (
    <text>
      {spans.map((s, i) => (
        <span key={i} fg={s.fg} bg={s.bg}>
          {s.text}
        </span>
      ))}
    </text>
  )
}

function Header() {
  const { state } = usePorts()
  const { width } = useTerminalDimensions()
  const stats = state.stats
  const statusColor = STATUS_COLOR[state.status]

  const statusText = state.status === "ready" ? "●" : `● ${state.status}`
  const statusSeg: Segment = { spans: [{ text: statusText, fg: statusColor }] }

  if (!stats) {
    const segments: Span[][] = [
      statusSeg.spans,
      [
        { text: "ports ", fg: colors.base },
        { text: String(state.ports.length), fg: colors.lavender },
      ],
      [
        { text: "seq ", fg: colors.base },
        { text: String(state.seq), fg: colors.lavender },
      ],
    ]
    if (state.error) segments.push([{ text: state.error, fg: colors.red }])
    return <StatusLine segments={segments} />
  }

  const batteryState = stats.batteryState?.toLowerCase()
  const batteryPct = stats.batteryChargePct ?? stats.batteryHealthPct

  const ramPct =
    stats.totalMemoryBytes > 0
      ? stats.usedMemoryBytes / stats.totalMemoryBytes
      : 0
  const diskPct =
    stats.totalDiskBytes > 0
      ? stats.usedDiskBytes / stats.totalDiskBytes
      : 0

  const segments: Segment[] = [
    statusSeg,
    { spans: [{ text: stats.hostLabel || "—", fg: colors.pink }] },
    {
      spans: [
        { text: formatChipWithGpu(stats.chip, stats.gpuCores), fg: colors.lavender },
      ],
      dropRank: 3,
    },
    {
      spans: [{ text: stats.osVersion, fg: colors.teal }],
      dropRank: 1,
    },
    {
      spans: usageSpans(
        ramPct,
        stats.usedMemoryBytes,
        stats.totalMemoryBytes,
        "ram",
      ),
    },
    {
      spans: usageSpans(
        diskPct,
        stats.usedDiskBytes,
        stats.totalDiskBytes,
        "disk",
      ),
    },
    {
      spans: [
        { text: "up ", fg: colors.base },
        { text: formatUptime(stats.uptimeSecs), fg: colors.lavender },
      ],
      dropRank: 2,
    },
  ]

  if (batteryPct != null) {
    const battSpans: Span[] = [
      { text: "batt ", fg: colors.base },
      { text: `${batteryPct}%`, fg: colors.lavender },
    ]
    if (
      batteryState &&
      (batteryState === "charging" || batteryState === "full")
    ) {
      battSpans.push({ text: ` ${batteryState}`, fg: colors.teal })
    }
    segments.push({ spans: battSpans })
  }

  segments.push({
    spans: [
      { text: "ports ", fg: colors.base },
      { text: String(state.ports.length), fg: colors.lavender },
    ],
  })
  if (state.error) {
    segments.push({ spans: [{ text: state.error, fg: colors.red }] })
  }

  return (
    <StatusLine segments={fitSegments(segments, width - CHROME_WIDTH)} />
  )
}

function TabBar({
  active,
  counts,
  onSelect,
}: {
  active: Category
  counts: Record<Category, number>
  onSelect: (next: Category) => void
}) {
  const sep = " │ "

  let prefixWidth = 0
  for (const id of TAB_ORDER) {
    if (id === active) break
    prefixWidth +=
      TAB_META[id].label.length + 1 + String(counts[id]).length + sep.length
  }
  const labelLen = TAB_META[active].label.length
  const countLen = String(counts[active]).length
  const underlineWidth = labelLen + 1 + countLen
  const underline = " ".repeat(prefixWidth) + "─".repeat(underlineWidth)

  return (
    <>
      <box style={{ flexDirection: "row" }}>
        {TAB_ORDER.map((id, i) => {
          const meta = TAB_META[id]
          const isActive = id === active
          return (
            <box
              key={id}
              style={{ flexDirection: "row" }}
              onMouseDown={() => onSelect(id)}
            >
              <text fg={isActive ? colors.lavender : colors.base}>
                {meta.label}
              </text>
              <text fg={isActive ? colors.pink : colors.base}>
                {` ${counts[id]}`}
              </text>
              {i < TAB_ORDER.length - 1 ? (
                <text fg={colors.base}>{sep}</text>
              ) : null}
            </box>
          )
        })}
      </box>
      <text fg={colors.blue}>{underline}</text>
    </>
  )
}

function GroupHeaderRow({
  group,
  collapsed,
  onToggle,
  isSelected,
}: {
  group: Group
  collapsed: boolean
  onToggle: () => void
  isSelected: boolean
}) {
  const arrow = collapsed ? "▶" : "▼"
  const cursor = isSelected ? "▸ " : "  "
  const count = group.children.length
  const directProcs = new Set(group.children.map((c) => c.pid).filter((p): p is number => p != null)).size
  return (
    <box
      id={`group-${group.key}`}
      style={{
        flexDirection: "row",
        backgroundColor: isSelected ? colors.base : undefined,
      }}
      onMouseDown={onToggle}
    >
      <text fg={isSelected ? colors.blue : colors.base}>{cursor}</text>
      <text fg={isSelected ? colors.lavender : colors.pink}>{arrow}</text>
      <text fg={colors.base}>{"  "}</text>
      <text fg={isSelected ? colors.lavender : colors.pink}>{group.name.padEnd(24)}</text>
      <text fg={colors.base}>{"PID ".padEnd(5)}</text>
      <text fg={colors.lavender}>{String(group.pid).padEnd(8)}</text>
      <text fg={colors.base}>{`${count} socket${count === 1 ? "" : "s"}`}</text>
      <text fg={colors.base}>{` · ${directProcs} proc${directProcs === 1 ? "" : "s"}`}</text>
    </box>
  )
}

function ChildRow({
  port,
  isSelected,
  onSelect,
}: {
  port: PortEntry
  isSelected: boolean
  onSelect: () => void
}) {
  const row = formatRow(port)
  const isContainer = port.category === "container"
  return (
    <box
      id={`row-${portKey(port)}`}
      style={{
        flexDirection: "row",
        backgroundColor: isSelected ? colors.base : undefined,
      }}
      onMouseDown={onSelect}
    >
      <text fg={isSelected ? colors.blue : colors.base}>
        {isSelected ? "▸ " : "  "}
      </text>
      <text fg={isSelected ? colors.blue : colors.pink}>
        {isContainer ? formatContainerLabel(port).padEnd(8) : row.port}
      </text>
      <text fg={colors.teal}>{row.proto}</text>
      <text fg={stateColor(port.state)}>{row.state}</text>
      <text fg={colors.lavender}>{row.pid}</text>
      <text fg={isContainer ? colors.pink : colors.lavender}>
        {(isContainer
          ? truncateContainerName(port.containerName ?? port.processName ?? "container", 24)
        : row.process.slice(0, 24)).padEnd(24)}
      </text>
      <text fg={colors.teal}>
        {isContainer
          ? truncateImage(port.containerImage, 40)
          : truncateCwd(port.cwd, 40)}
      </text>
      <text fg={colors.base}>{row.addr}</text>
    </box>
  )
}

function truncateContainerName(name: string | undefined, max: number): string {
  if (!name) return "—"
  if (name.length <= max) return name
  return name.slice(0, max - 1) + "…"
}

function truncateImage(image: string | undefined, max: number): string {
  if (!image) return "—".padEnd(max)
  if (image.length <= max) return image.padEnd(max)
  return "…" + image.slice(image.length - (max - 1))
}

function ContainerColumnsHeader() {
  return (
    <text fg={colors.base}>
      {"  PORT    PROTO STATE        PID     NAME                                  IMAGE                                        LOCAL ADDR"}
    </text>
  )
}

function PortTable({
  rows,
  selectedIndex,
  collapsed,
  onToggleGroup,
  onSelectRow,
}: {
  rows: Row[]
  selectedIndex: number
  collapsed: Set<string>
  onToggleGroup: (key: string) => void
  onSelectRow: (rowIndex: number) => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const prevSelectedRef = useRef<number>(-1)

  useEffect(() => {
    if (selectedIndex === prevSelectedRef.current) return
    prevSelectedRef.current = selectedIndex
    const box = scrollRef.current
    const row = rows[selectedIndex]
    if (!box || !row) return
    const id =
      row.kind === "header"
        ? `group-${row.group.key}`
        : `row-${portKey(row.port)}`
    box.scrollChildIntoView(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex])

  return (
    <scrollbox ref={scrollRef} style={{ rootOptions: { flexGrow: 1 } }}>
      <box style={{ flexDirection: "column" }}>
        {rows.map((row, i) => {
          const isSelected = i === selectedIndex
          if (row.kind === "header") {
            return (
              <GroupHeaderRow
                key={row.group.key}
                group={row.group}
                collapsed={collapsed.has(row.group.key)}
                onToggle={() => onToggleGroup(row.group.key)}
                isSelected={isSelected}
              />
            )
          }
          return (
            <ChildRow
              key={portKey(row.port)}
              port={row.port}
              isSelected={isSelected}
              onSelect={() => onSelectRow(i)}
            />
          )
        })}
      </box>
    </scrollbox>
  )
}

function Footer() {
  const { state } = usePorts()
  const base = "↑/↓ select · home/end jump · g/G next/prev group · space collapse · x kill · t terminal · tab cat · r restart · q quit"
  const containerExtra = state.ports.some((p) => p.category === "container")
    ? " · s stop container"
    : ""
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={colors.base}>{`${base}${containerExtra}`}</text>
      {state.notice ? <text fg={colors.yellow}>{state.notice}</text> : null}
    </box>
  )
}

function Dashboard() {
  const { state, killProcess, stopContainer, openTerminal, restart } = usePorts()
  const renderer = useRenderer()
  const [activeTab, setActiveTab] = useState<Category>("user-dev")
  const [selected, setSelected] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const counts = useMemo(() => {
    const c: Record<Category, number> = {
      "user-dev": 0,
      "user-app": 0,
      container: 0,
      system: 0,
    }
    for (const p of state.ports) c[p.category]++
    return c
  }, [state.ports])

  const groups = useMemo(() => {
    const filtered = state.ports.filter((p) => p.category === activeTab)
    return groupPorts(filtered)
  }, [state.ports, activeTab])

  const rows = useMemo(() => buildRows(groups, collapsed), [groups, collapsed])
  const safeSelected = Math.min(selected, Math.max(0, rows.length - 1))
  const current = rows[safeSelected]

  const toggleGroup = (key: string) => {
    const willCollapse = !collapsed.has(key)
    if (willCollapse) {
      let headerIdx = -1
      let groupSize = 0
      let rowsBefore = 0
      for (const g of groups) {
        if (g.key === key) {
          headerIdx = rowsBefore
          groupSize = g.children.length
          break
        }
        rowsBefore += 1 + (collapsed.has(g.key) ? 0 : g.children.length)
      }
      if (headerIdx >= 0) {
        const newLen = rows.length - groupSize
        setSelected((cur) => {
          if (cur > headerIdx && cur <= headerIdx + groupSize) {
            return newLen > 0 ? Math.min(headerIdx + 1, newLen - 1) : 0
          }
          if (cur > headerIdx + groupSize) {
            return Math.max(0, cur - groupSize)
          }
          return cur
        })
      }
    }
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const targetPidForRow = (row: Row | undefined): number | undefined => {
    if (!row) return undefined
    if (row.kind === "header") return row.group.pid
    return row.port.pid
  }

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      renderer.destroy()
      return
    }
    if (key.name === "tab") {
      const i = TAB_ORDER.indexOf(activeTab)
      const nextIdx = key.shift
        ? (i - 1 + TAB_ORDER.length) % TAB_ORDER.length
        : (i + 1) % TAB_ORDER.length
      const next = TAB_ORDER[nextIdx]
      if (next) {
        setActiveTab(next)
        setSelected(0)
      }
      return
    }
    if (key.name === "r") restart()
    if (key.name === "up") setSelected((i) => Math.max(0, i - 1))
    if (key.name === "down") setSelected((i) => Math.min(rows.length - 1, i + 1))
    if (key.name === "home") setSelected(0)
    if (key.name === "end") setSelected(rows.length - 1)
    if (key.name === "g" || (key.shift && key.name === "g")) {
      const headers = rows
        .map((r, i) => ({ r, i }))
        .filter((x) => x.r.kind === "header")
      if (headers.length === 0) return
      const cur = safeSelected
      const isShift = key.shift
      const next = isShift
        ? headers.filter((h) => h.i < cur).pop()
        : headers.find((h) => h.i > cur)
      if (next) setSelected(next.i)
      else if (isShift) setSelected(headers[0]!.i)
    }
    if (key.name === "space" || key.name === "return") {
      if (!current) return
      const targetKey =
        current.kind === "header"
          ? current.group.key
          : current.groupKey
      toggleGroup(targetKey)
      return
    }
    const pid = targetPidForRow(current)
    if (key.name === "x" && pid != null) {
      killProcess(pid, key.shift ? "kill" : "term")
    }
    if (key.name === "t" && pid != null) {
      const cwd = current?.kind === "child" ? current.port.cwd : undefined
      openTerminal(pid, cwd)
    }
    if (key.name === "s" && current?.kind === "child" && current.port.containerId) {
      stopContainer(current.port.containerId)
    }
  })

  return (
    <box
      title="pscanner"
      titleAlignment="left"
      style={{
        width: "100%",
        height: "100%",
        border: true,
        borderStyle: "single",
        borderColor: colors.base,
        paddingX: 2,
        paddingY: 1,
        flexDirection: "column",
        gap: 1,
      }}
    >
      <box style={{ position: "absolute", right: 1, bottom: 0 }}>
        <PixelCat />
      </box>
      <Header />
      <TabBar active={activeTab} counts={counts} onSelect={setActiveTab} />
      <text fg={colors.base}>{TAB_META[activeTab].hint}</text>
      {activeTab === "container" ? (
        <ContainerColumnsHeader />
      ) : (
        <text fg={colors.base}>
          {"  PORT    PROTO STATE        PID     PROCESS                 CWD                                       LOCAL ADDR"}
        </text>
      )}
      <PortTable
        key={`${activeTab}|${[...collapsed].sort().join(",")}`}
        rows={rows}
        selectedIndex={safeSelected}
        collapsed={collapsed}
        onToggleGroup={toggleGroup}
        onSelectRow={setSelected}
      />
      <Footer />
    </box>
  )
}

function App() {
  return (
    <MonitorProvider>
      <Dashboard />
    </MonitorProvider>
  )
}

const VERSION =
  process.env.PORTSCANNER_VERSION ??
  (await Bun.file(import.meta.dir + "/package.json")
    .json()
    .then((p: unknown) =>
      typeof p === "object" && p !== null && "version" in p
        ? String((p as { version: unknown }).version)
        : "0.0.0",
    )
    .catch(() => "0.0.0"))

const subcommand = process.argv[2]
const shareDir = dirname(process.execPath)

const HELP_LINES = [
  `pscanner ${VERSION} — keyboard-driven TUI for local TCP/UDP ports`,
  ``,
  `Usage:`,
  `  pscanner <command>`,
  ``,
  `Commands:`,
  `  (none)         launch the TUI`,
  `  version        print version`,
  `  update         rebuild and reinstall from source`,
  `  uninstall      remove the symlink and ~/.local/share/pscanner`,
  `  help           show this help`,
]

function printHelp() {
  for (const line of HELP_LINES) process.stdout.write(`${line}\n`)
}

if (subcommand === "update") {
  const result = Bun.spawnSync(
    ["bun", "run", join(shareDir, "install.ts")],
    { stdio: ["inherit", "inherit", "inherit"] },
  )
  process.exit(result.exitCode ?? 0)
}

if (subcommand === "uninstall") {
  const result = Bun.spawnSync(
    ["bun", "run", join(shareDir, "uninstall.ts")],
    { stdio: ["inherit", "inherit", "inherit"] },
  )
  process.exit(result.exitCode ?? 0)
}

if (
  subcommand === "version" ||
  subcommand === "--version" ||
  subcommand === "-V"
) {
  process.stdout.write(`pscanner ${VERSION}\n`)
  process.exit(0)
}

if (
  subcommand === "help" ||
  subcommand === "--help" ||
  subcommand === "-h"
) {
  printHelp()
  process.exit(0)
}

if (subcommand !== undefined && subcommand !== "") {
  process.stderr.write(`pscanner: unknown subcommand '${subcommand}'\n`)
  process.stderr.write(`Run 'pscanner help' for a list of commands.\n`)
  process.exit(1)
}

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
