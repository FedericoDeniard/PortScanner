import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { MonitorProvider, usePorts } from "./src/store"
import { portKey, type Category, type PortEntry } from "./src/monitor/protocol"
import { colors } from "./src/theme"

const STATUS_COLOR = {
  connecting: colors.yellow,
  ready: colors.green,
  error: colors.red,
} as const

const TAB_ORDER: Category[] = ["user-dev", "user-app", "system"]

const TAB_META: Record<Category, { label: string; hint: string }> = {
  "user-dev": { label: "Dev", hint: "levantados por el usuario" },
  "user-app": { label: "Apps", hint: "apps en background" },
  system: { label: "System", hint: "macOS — no tocar" },
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
    addr: p.localAddr,
  }
}

function Header() {
  const { state } = usePorts()
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={STATUS_COLOR[state.status]}>● {state.status}</text>
      <text fg={colors.base}>ports</text>
      <text fg={colors.lavender}>{state.ports.length}</text>
      <text fg={colors.base}>seq</text>
      <text fg={colors.lavender}>{state.seq}</text>
      {state.error ? <text fg={colors.red}>{state.error}</text> : null}
    </box>
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

function PortTable({
  ports,
  selectedIndex,
}: {
  ports: PortEntry[]
  selectedIndex: number
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const current = ports[selectedIndex]

  useEffect(() => {
    if (current) scrollRef.current?.scrollChildIntoView(`row-${portKey(current)}`)
  }, [selectedIndex, current])

  return (
    <scrollbox ref={scrollRef} style={{ rootOptions: { flexGrow: 1 } }}>
      <box style={{ flexDirection: "column" }}>
        {ports.map((p, i) => {
          const row = formatRow(p)
          const isSelected = i === selectedIndex
          return (
            <box
              key={portKey(p)}
              id={`row-${portKey(p)}`}
              style={{
                flexDirection: "row",
                backgroundColor: isSelected ? colors.base : undefined,
              }}
            >
              <text fg={isSelected ? colors.blue : colors.pink}>{row.port}</text>
              <text fg={colors.teal}>{row.proto}</text>
              <text fg={stateColor(p.state)}>{row.state}</text>
              <text fg={colors.lavender}>{row.pid}</text>
              <text fg={colors.lavender}>{row.process}</text>
              <text fg={colors.base}>{row.addr}</text>
            </box>
          )
        })}
      </box>
    </scrollbox>
  )
}

function Footer() {
  const { state } = usePorts()
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={colors.base}>
        ↑/↓ select · x kill · X kill -9 · tab switch · r restart · q quit
      </text>
      {state.notice ? <text fg={colors.yellow}>{state.notice}</text> : null}
    </box>
  )
}

function Dashboard() {
  const { state, killProcess, restart } = usePorts()
  const renderer = useRenderer()
  const [activeTab, setActiveTab] = useState<Category>("user-dev")
  const [selected, setSelected] = useState(0)

  const counts = useMemo(() => {
    const c: Record<Category, number> = { "user-dev": 0, "user-app": 0, system: 0 }
    for (const p of state.ports) c[p.category]++
    return c
  }, [state.ports])

  const ports = useMemo(
    () => state.ports.filter((p) => p.category === activeTab),
    [state.ports, activeTab],
  )
  const index = Math.min(selected, Math.max(0, ports.length - 1))
  const current = ports[index]

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
    if (key.name === "down") setSelected((i) => Math.min(ports.length - 1, i + 1))
    if (key.name === "x" && current?.pid != null) {
      killProcess(current.pid, key.shift ? "kill" : "term")
    }
  })

  return (
    <box
      title="portscanner"
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
      <Header />
      <TabBar active={activeTab} counts={counts} onSelect={setActiveTab} />
      <text fg={colors.base}>{TAB_META[activeTab].hint}</text>
      <text fg={colors.base}>
        {"PORT     PROTO  STATE         PID     PROCESS              LOCAL ADDR"}
      </text>
      <PortTable key={activeTab} ports={ports} selectedIndex={index} />
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

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
