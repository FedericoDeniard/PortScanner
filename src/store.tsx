import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { join } from "node:path"
import { homedir } from "node:os"
import { MonitorClient } from "./monitor/client"
import {
  portKey,
  type MonitorEvent,
  type PortEntry,
  type SystemStats,
} from "./monitor/protocol"

export type MonitorStatus = "connecting" | "ready" | "error"

export type PortsState = {
  ports: PortEntry[]
  status: MonitorStatus
  seq: number
  stats?: SystemStats
  error?: string
  notice?: string
}

export type PortsAction =
  | { type: "READY" }
  | { type: "SNAPSHOT"; seq: number; ports: PortEntry[] }
  | { type: "DELTA"; seq: number; added: PortEntry[]; removed: PortEntry[] }
  | { type: "STATS"; stats: SystemStats }
  | { type: "NOTICE"; notice?: string }
  | { type: "ERROR"; error: string }

export function portsReducer(state: PortsState, action: PortsAction): PortsState {
  switch (action.type) {
    case "READY":
      return { ...state, status: "ready", error: undefined }
    case "SNAPSHOT":
      return {
        ...state,
        status: "ready",
        error: undefined,
        ports: sortPorts(action.ports),
        seq: action.seq,
      }
    case "DELTA": {
      const removed = new Set(action.removed.map(portKey))
      const kept = state.ports.filter((p) => !removed.has(portKey(p)))
      return { ...state, ports: sortPorts([...kept, ...action.added]), seq: action.seq }
    }
    case "STATS":
      return { ...state, stats: action.stats }
    case "NOTICE":
      return { ...state, notice: action.notice }
    case "ERROR":
      return { ...state, status: "error", error: action.error }
  }
}

function sortPorts(ports: PortEntry[]): PortEntry[] {
  return [...ports].sort(
    (a, b) => a.localPort - b.localPort || a.protocol.localeCompare(b.protocol),
  )
}

const MAX_AUTO_RESTARTS = 3

export function installedMonitorPath(): string {
  const exe = process.platform === "win32" ? "portmon.exe" : "portmon"
  return join(
    homedir(),
    ".local",
    "share",
    "pscanner",
    `${exe}-${process.platform}-${process.arch}`,
  )
}

export function resolveMonitorBin(): string {
  if (process.env.PORTMON_BIN) return process.env.PORTMON_BIN
  const installed = installedMonitorPath()
  try {
    if (Bun.file(installed).size > 0) return installed
  } catch {}
  const exe = process.platform === "win32" ? "portmon.exe" : "portmon"
  const profile = process.env.PORTMON_RELEASE ? "release" : "debug"
  return `monitor/target/${profile}/${exe}`
}

type StoreValue = {
  state: PortsState
  killProcess: (pid: number, signal?: "term" | "kill") => void
  openTerminal: (pid: number, cwd?: string) => void
  restart: () => void
}

const StoreCtx = createContext<StoreValue | null>(null)

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(portsReducer, {
    ports: [],
    status: "connecting",
    seq: 0,
  })
  const [generation, setGeneration] = useState(0)
  const clientRef = useRef<MonitorClient | null>(null)
  const restartsRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let client: MonitorClient | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const start = async () => {
      const binPath = resolveMonitorBin()
      if (!(await Bun.file(binPath).exists())) {
        dispatch({
          type: "ERROR",
          error: `monitor not found at ${binPath} — run: bun run build:monitor`,
        })
        return
      }
      if (cancelled) return

      client = MonitorClient.spawn(binPath)
      clientRef.current = client

      client.on("event", (evt: MonitorEvent) => {
        if (cancelled) return
        switch (evt.type) {
          case "hello":
            restartsRef.current = 0
            dispatch({ type: "READY" })
            break
          case "snapshot":
            dispatch({ type: "SNAPSHOT", seq: evt.seq, ports: evt.ports })
            break
          case "delta":
            dispatch({ type: "DELTA", seq: evt.seq, added: evt.added, removed: evt.removed })
            break
          case "stats":
            dispatch({ type: "STATS", stats: evt.stats })
            break
          case "ack":
            if (!evt.ok) dispatch({ type: "NOTICE", notice: evt.error ?? "command failed" })
            break
          case "opened":
            dispatch({
              type: "NOTICE",
              notice: evt.ok
                ? `opened in ${evt.terminal ?? "terminal"}`
                : `no terminal found (${evt.error ?? "no match"})`,
            })
            break
          case "error":
            console.error("[portmon]", evt.message)
            break
        }
      })

      client.on("exit", (code) => {
        if (cancelled) return
        if (restartsRef.current < MAX_AUTO_RESTARTS) {
          restartsRef.current += 1
          dispatch({
            type: "NOTICE",
            notice: `monitor exited (code ${code}), restarting…`,
          })
          retryTimer = setTimeout(() => {
            if (!cancelled) void start()
          }, 500 * restartsRef.current)
        } else {
          dispatch({ type: "ERROR", error: `monitor exited (code ${code})` })
        }
      })

      client.on("stderr", (line) => console.error("[portmon]", line))
    }

    void start()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      const current = client
      client = null
      clientRef.current = null
      void current?.dispose()
    }
  }, [generation])

  const value: StoreValue = {
    state,
    killProcess: (pid, signal) => clientRef.current?.killProcess(pid, signal),
    openTerminal: (pid, cwd) => clientRef.current?.openTerminal(pid, cwd),
    restart: () => {
      restartsRef.current = 0
      setGeneration((g) => g + 1)
    },
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function usePorts(): StoreValue {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error("usePorts must be used within MonitorProvider")
  return ctx
}
