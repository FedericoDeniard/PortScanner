import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { MonitorProvider, usePorts } from "./src/store"
import { portKey, type PortEntry } from "./src/monitor/protocol"
import { colors } from "./src/theme"

const STATUS_COLOR = {
  connecting: colors.yellow,
  ready: colors.green,
  error: colors.red,
} as const

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

function PortTable() {
  const { state, killProcess, restart } = usePorts()
  const renderer = useRenderer()
  const [selected, setSelected] = useState(0)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const ports = state.ports
  const index = Math.min(selected, Math.max(0, ports.length - 1))
  const current = ports[index]

  useEffect(() => {
    if (current) scrollRef.current?.scrollChildIntoView(`row-${portKey(current)}`)
  }, [index, current])

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      renderer.destroy()
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
    <scrollbox ref={scrollRef} style={{ rootOptions: { flexGrow: 1 } }}>
      <box style={{ flexDirection: "column" }}>
        {ports.map((p, i) => {
          const row = formatRow(p)
          const isSelected = i === index
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
      <text fg={colors.base}>↑/↓ select · x kill · X kill -9 · r restart · q quit</text>
      {state.notice ? <text fg={colors.yellow}>{state.notice}</text> : null}
    </box>
  )
}

function Dashboard() {
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
      <text fg={colors.base}>
        {"PORT     PROTO  STATE         PID     PROCESS              LOCAL ADDR"}
      </text>
      <PortTable />
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
