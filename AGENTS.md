# PortScanner

TCP/UDP port viewer/scanner in use on the local machine, built as a TUI with **OpenTUI** + **React 19** + **TypeScript**, with a **monitor backend in Rust** (`monitor/`) that reports sockets over NDJSON via stdio.

## Commands

| Command | Description |
| --- | --- |
| `bun run dev` | Compiles the Rust monitor (debug) and runs the TUI. |
| `bun start` | Runs the TUI (requires the binary already compiled). |
| `bun run build:monitor` | Compiles the Rust monitor in release. |
| `bun run install` | Full build (Rust release + TUI self-contained) and installs `pscanner` in `~/.local/bin`. |
| `pscanner help` | Lists subcommands (`version`, `update`, `uninstall`, `help`); same as `--help` / `-h`. |
| `pscanner update` | Re-runs install (reads `sourceDir` from `~/.local/share/pscanner/config.json`). Brew users: use `brew upgrade pscanner` instead. |
| `pscanner uninstall` | Removes symlinks in `~/.local/bin` and `~/.local/share/pscanner/`. Brew users: use `brew uninstall pscanner`. |
| `bun run uninstall` | Same as `pscanner uninstall` but invoked from the source tree. |
| `bun run scripts/package.ts --target <target>` | Builds monitor + TUI for one platform target and emits `release/pscanner_<ver>_<target>.tar.gz` + `.sha256`. Targets: `darwin-arm64`, `darwin-x86_64`, `linux-x86_64`, `linux-arm64`. Used by CI; not needed locally. |
| `bun run scripts/gen-formula.ts` | Renders `Formula/pscanner.rb` from `VERSION` + `URL_<TARGET>` + `SHA_<TARGET>` env vars. Used by CI. |
| `bun test` | TS tests (`bun:test`) + Rust tests (`cargo test`). |

Package manager: **bun** (lockfile `bun.lock`). Rust toolchain: **cargo** (crate in `monitor/`).

There is no TS build step: `bun run index.tsx` directly. The Rust binary lands in `monitor/target/{debug,release}/portmon`.

## Stack

- **Runtime**: Bun (ESM, `"type": "module"`).
- **UI**: [`@opentui/core`](https://github.com/anomalyco/opentui) + [`@opentui/react`](https://github.com/anomalyco/opentui) (React bindings).
- **React**: v19.3.
- **TypeScript**: 5.9, strict by convention.
- **Monitor**: Rust (`netstat2` for sockets, `sysinfo` for process names, `serde_json` for the protocol).

## Structure

```
.
├── index.tsx               # Entry point: renderer + <App />, ports table
├── scripts/                # Build/install orchestrators
│   ├── install.ts          # `bun run install`: release build + bundle + link in ~/.local/bin
│   ├── uninstall.ts        # `bun run uninstall`: removes symlinks and ~/.local/share/pscanner
│   ├── package.ts          # build + tar.gz + sha256 for a single platform target
│   └── gen-formula.ts      # render Formula/pscanner.rb from env inputs
├── monitor/                # Rust crate: socket monitor (child process)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs         # Main loop: periodic scan + stdin commands
│       ├── proto.rs        # NDJSON protocol (Event/Command/PortEntry, serde)
│       ├── scan.rs         # netstat2 → PortEntry (+ name via sysinfo)
│       ├── diff.rs         # snapshot → delta (added/removed)
│       └── kill.rs         # cross-platform kill (libc unix / windows-sys)
├── src/
│   ├── monitor/
│   │   ├── protocol.ts     # TS types mirroring proto.rs
│   │   ├── lines.ts        # Chunks → NDJSON lines (partial buffer)
│   │   └── client.ts       # MonitorClient: spawn, parse, commands, dispose
│   ├── store.tsx           # MonitorProvider (Context+reducer) + usePorts()
│   └── theme.ts            # Color/spacing tokens
├── .github/workflows/
│   └── release.yml         # Tag-driven release: builds, publishes, updates tap
├── design.md               # Design system (palette, tokens, components)
├── BREW_RELEASE.md         # Audit trail for the Homebrew tap automation
├── opencode.json           # opencode config (loads design.md as instructions)
├── package.json
├── bun.lock
└── tsconfig.json
```

## Rust backend ↔ TUI

The TUI spawns `monitor/target/debug/portmon` as a child process (`Bun.spawn`). **NDJSON** communication: events over stdout (`hello`/`snapshot`/`delta`/`ack`/`error`), commands over stdin (`set_interval`/`set_filter`/`kill`/`shutdown`). If stdin closes (the TUI died), the monitor exits on its own. To debug the monitor manually:

```bash
echo '{"cmd":"shutdown"}' | ./monitor/target/debug/portmon | jq
```

Override the binary with `PORTMON_BIN`; use release with `PORTMON_RELEASE=1`.

### Lookup chain of `resolveMonitorBin()` (`src/store.tsx`)

1. `PORTMON_BIN` (env var) — always takes priority.
2. `~/.local/share/pscanner/portmon-<platform>-<arch>` — installed use (set by `bun run install`).
3. `./monitor/target/{release|debug}/portmon` — dev fallback (relative path).

The TS types (`src/monitor/protocol.ts`) are a manual mirror of `monitor/src/proto.rs` — if one changes, change the other.

## Conventions

- **Style**: minimal, no extra UI frameworks. React components directly with OpenTUI primitives (`<box>`, `<text>`).
- **Style props**: use `style={{ ... }}` in camelCase (`backgroundColor`, `flexDirection`, `borderStyle`).
- **ESM imports** without extension: `import { createCliRenderer } from "@opentui/core"`.
- **No unnecessary comments** in code.
- **Color tokens**: always import from `design.md` (via opencode.json) — do not hardcode hex codes in new components.
- **System commands**: to discover ports we use `lsof`.

## Design

The complete visual system is defined in [`design.md`](./design.md) and is automatically loaded as instructions via `opencode.json`. Quick summary:

- Palette: 8 fixed colors (`#51576c`, `#e98186`, `#a6d28a`, `#e6c890`, `#8caaec`, `#f2b9e5`, `#82c8be`, `#b5bfe2`).
- Typography: monospaced (`JetBrains Mono`, `Fira Code`, etc.).
- Base background: `colors.base` (`#51576c`). Pastel accents only in small doses and with a semantic role.
- Predominant text size: 12–14px.

Before creating a component or adding a color, **consult `design.md`**.

## Gotchas

- `@opentui/react` requires `await createCliRenderer()` before `createRoot(renderer).render(...)`.
- `useKeyboard` consumes the event globally; close with `renderer.destroy()` on `Esc`/`q`.
- Do not introduce new dependencies without consensus.
- Keep the app destructible with `q` / `Esc` from any view.
- `console.log` inside the TUI is not visible in the terminal: it goes to the OpenTUI console overlay (toggle with `renderer.console.toggle()`); the Rust monitor's stderr is forwarded there.
- Never `process.exit()` directly: it leaves the terminal broken. Use `renderer.destroy()`.
- The Rust monitor detects EOF on stdin and closes on its own; still, `MonitorClient.dispose()` sends `shutdown` and `kill()`s as a fallback after timeout.

## Releases

See [`BREW_RELEASE.md`](./BREW_RELEASE.md) for the full release flow —
cutting a release, watching the pipeline, troubleshooting, rollback.