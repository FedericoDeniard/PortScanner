# pscanner

A keyboard-driven terminal UI for inspecting the TCP/UDP ports in use on your
local machine. Sockets are grouped by their owning application, tagged with the
process that opened them, and can be killed or jumped to from the TUI itself.

pscanner pairs a React 19 + OpenTUI front-end with a small Rust monitor process
that owns the actual socket and process lookups. The two sides talk over stdio
using newline-delimited JSON, so the UI stays responsive and the heavy lifting
(sockets via `netstat2`, process metadata via `sysinfo`, working directory via
`lsof`) lives in native code.

## Features

- Live snapshot of every TCP/UDP socket on the host, refreshed once per second
  by default.
- Sockets grouped by the **application that owns them** (not the kernel worker
  that happened to open them) — e.g. every helper of a `.app` bundle rolls up
  under its main executable.
- Three categories per row: **Dev** (servers you started locally), **Apps**
  (background apps) and **System** (macOS components — clearly marked, do not
  touch).
- Per-row metadata: local address, protocol, socket state, PID, process name,
  working directory.
- Kill a process from the TUI: `x` sends `SIGTERM`, `X` (shift) sends
  `SIGKILL`.
- Jump to the owning terminal: `t` opens the iTerm2 / WezTerm / kitty pane or
  Orca worktree that started the process, when one can be matched.
- Auto-restart: if the monitor dies, pscanner respawns it (up to three times)
  before surfacing the error.

## Architecture

```
┌──────────────────────────┐  NDJSON over stdio   ┌─────────────────────┐
│  TUI (OpenTUI + React)   │  ─────────────────▶  │  monitor (Rust)     │
│  index.tsx, src/store    │  ◀─────────────────  │  netstat2 + sysinfo │
└──────────────────────────┘                      └─────────────────────┘
```

The TUI spawns `monitor/target/{debug,release}/portmon` with `Bun.spawn`, then
pumps its stdout line-by-line through a JSON parser. Commands
(`set_interval`, `set_filter`, `kill`, `open_terminal`, `shutdown`) are written
to stdin as one JSON object per line.

The Rust monitor owns the scan loop: on each tick it grabs all IPv4/IPv6 TCP
and UDP sockets via `netstat2`, enriches each entry with process metadata from
`sysinfo`, walks the parent chain to find the owning app bundle, resolves the
working directory with `lsof`, and finally computes an added/removed delta
against the previous snapshot. The first snapshot is sent in full; subsequent
updates are sent as deltas to keep the wire format compact.

## Requirements

- [Bun](https://bun.sh) 1.4+ (package manager and TUI runtime)
- [Rust](https://www.rust-lang.org) stable (builds the `portmon` binary)
- macOS for the full feature set — `lsof` is used for working-directory lookups
  and the terminal-jump heuristics rely on macOS-specific conventions. The
  monitor compiles on Linux and Windows but those paths are best-effort.

## Install

```bash
git clone https://github.com/FedericoDeniard/PortScanner.git
cd PortScanner
bun install
```

`bun install` only fetches the JS dependencies; it does **not** compile the
Rust monitor. Pick one of:

| Goal                              | Command                |
| --------------------------------- | ---------------------- |
| Develop locally (debug monitor)   | `bun run dev`          |
| Build the release monitor         | `bun run build:monitor`|
| Install `pscanner` into `~/.local`| `bun run install`      |

`bun run install` compiles both the Rust monitor and a self-contained TUI
binary with `bun build --compile`, then symlinks them into:

- `~/.local/bin/pscanner` — the launcher
- `~/.local/bin/pscanner-update` — re-runs the installer using the
  `sourceDir` recorded in `~/.local/share/pscanner/config.json`

If `~/.local/bin` is not on your `PATH`, the installer prints the export line
to add.

After installation:

```bash
pscanner            # launch
pscanner --version  # print version
pscanner-update     # rebuild and reinstall after editing the source
```

## Usage

```bash
bun run dev    # build the debug monitor and run the TUI
bun start      # run the TUI against the existing monitor binary
```

Inside the TUI:

| Key             | Action                                                   |
| --------------- | -------------------------------------------------------- |
| `↑` / `↓`       | Move selection                                           |
| `Home` / `End`  | Jump to first / last row                                 |
| `g` / `G`       | Jump to next / previous group header                     |
| `Space` / `Enter` | Collapse or expand the current group                   |
| `Tab` / `Shift+Tab` | Switch between Dev / Apps / System categories        |
| `x`             | Send `SIGTERM` to the owning process                     |
| `X`             | Send `SIGKILL` to the owning process                     |
| `t`             | Open the terminal that owns the process                   |
| `r`             | Restart the monitor (force a fresh snapshot)             |
| `q` / `Esc`     | Quit                                                     |

You can also click tab labels and rows with the mouse.

## Configuration

The TUI looks up the monitor binary in this order (`resolveMonitorBin()` in
`src/store.tsx`):

1. `$PORTMON_BIN` — explicit override, useful for debugging.
2. `~/.local/share/pscanner/portmon-<platform>-<arch>` — what
   `bun run install` deploys.
3. `monitor/target/{release,debug}/portmon` — relative dev fallback. Release is
   selected when `PORTMON_RELEASE=1` is set in the environment.

## Tests

```bash
bun test                       # TS tests (grouping, navigation, line splitter, store)
cargo test --manifest-path monitor/Cargo.toml   # Rust tests (proto, diff, scan, terminal)
```

`bun test` (which also chains the Rust suite) is wired up as the default
`test` script.

## Layout

```
.
├── index.tsx               TUI entry point — renderer + <App />
├── scripts/
│   ├── install.ts          Build, bundle, link into ~/.local
│   └── uninstall.ts        Remove symlinks and ~/.local/share/pscanner
├── monitor/                Rust crate (portmon)
│   └── src/
│       ├── main.rs         Scan loop + stdin command channel
│       ├── proto.rs        NDJSON protocol (events, commands, filters)
│       ├── scan.rs         netstat2 + sysinfo + lsof enrichment
│       ├── diff.rs         Snapshot → added/removed delta
│       ├── kill.rs         Cross-platform SIGTERM/SIGKILL
│       └── terminal.rs     Locate the owning terminal (Orca, iTerm2, WezTerm, kitty)
├── src/
│   ├── monitor/
│   │   ├── protocol.ts     TS mirror of monitor/src/proto.rs
│   │   ├── lines.ts        Stream chunk → NDJSON line buffer
│   │   └── client.ts       MonitorClient: spawn, parse, send commands
│   ├── store.tsx           MonitorProvider + usePorts() hook
│   ├── grouping.ts         Roll sockets up under their owning app
│   └── theme.ts            Design tokens (see design.md)
├── design.md               Visual system (palette, typography, spacing)
└── investigacion-puertos.md  Notes on how sockets are discovered on macOS
```

`src/monitor/protocol.ts` is a hand-maintained mirror of `monitor/src/proto.rs`
— if you change one, change the other.

## License

ISC.
