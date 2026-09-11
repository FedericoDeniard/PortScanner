# PortScanner

Visualizador/escaner de puertos TCP/UDP en uso en la máquina local, construido como TUI con **OpenTUI** + **React 19** + **TypeScript**, con un **backend monitor en Rust** (`monitor/`) que reporta sockets por NDJSON sobre stdio.

## Comandos

| Comando | Descripción |
| --- | --- |
| `bun run dev` | Compila el monitor Rust (debug) y ejecuta la TUI. |
| `bun start` | Ejecuta la TUI (requiere el binario ya compilado). |
| `bun run build:monitor` | Compila el monitor Rust en release. |
| `bun run install` | Build completo (Rust release + TUI self-contained) e instala `pscanner` en `~/.local/bin`. |
| `pscanner-update` | Re-corre el install (lee `sourceDir` de `~/.local/share/pscanner/config.json`). |
| `bun run uninstall` | Borra symlinks en `~/.local/bin` y `~/.local/share/pscanner/`. |
| `bun test` | Tests TS (`bun:test`) + tests Rust (`cargo test`). |

Package manager: **bun** (lockfile `bun.lock`). Toolchain Rust: **cargo** (crate en `monitor/`).

No hay paso de build TS: `bun run index.tsx` directamente. El binario Rust queda en `monitor/target/{debug,release}/portmon`.

## Stack

- **Runtime**: Bun (ESM, `"type": "module"`).
- **UI**: [`@opentui/core`](https://github.com/anomalyco/opentui) + [`@opentui/react`](https://github.com/anomalyco/opentui) (bindings de React).
- **React**: v19.3.
- **TypeScript**: 5.9, strict por convención.
- **Monitor**: Rust (`netstat2` para sockets, `sysinfo` para nombres de proceso, `serde_json` para el protocolo).

## Estructura

```
.
├── index.tsx               # Entry point: renderer + <App />, tabla de puertos
├── scripts/                # Build/install orchestrators
│   ├── install.ts          # `bun run install`: build release + bundle + link en ~/.local/bin
│   └── uninstall.ts        # `bun run uninstall`: borra symlinks y ~/.local/share/pscanner
├── monitor/                # Crate Rust: monitor de sockets (proceso hijo)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs         # Loop principal: scan periódico + comandos stdin
│       ├── proto.rs        # Protocolo NDJSON (Event/Command/PortEntry, serde)
│       ├── scan.rs         # netstat2 → PortEntry (+ nombre vía sysinfo)
│       ├── diff.rs         # snapshot → delta (added/removed)
│       └── kill.rs         # kill cross-platform (libc unix / windows-sys)
├── src/
│   ├── monitor/
│   │   ├── protocol.ts     # Tipos TS espejo de proto.rs
│   │   ├── lines.ts        # Chunks → líneas NDJSON (buffer parcial)
│   │   └── client.ts       # MonitorClient: spawn, parse, comandos, dispose
│   ├── store.tsx           # MonitorProvider (Context+reducer) + usePorts()
│   └── theme.ts            # Tokens de color/espaciado
├── design.md               # Sistema de diseño (paleta, tokens, componentes)
├── investigacion-puertos.md # Notas de investigación sobre puertos en macOS
├── opencode.json           # Config de opencode (carga design.md como instrucciones)
├── package.json
├── bun.lock
└── tsconfig.json
```

## Backend Rust ↔ TUI

La TUI spawnea `monitor/target/debug/portmon` como proceso hijo (`Bun.spawn`). Comunicación **NDJSON**: eventos por stdout (`hello`/`snapshot`/`delta`/`ack`/`error`), comandos por stdin (`set_interval`/`set_filter`/`kill`/`shutdown`). Si stdin cierra (la TUI murió), el monitor sale solo. Para debuggear el monitor a mano:

```bash
echo '{"cmd":"shutdown"}' | ./monitor/target/debug/portmon | jq
```

Override del binario con `PORTMON_BIN`; usar release con `PORTMON_RELEASE=1`.

### Lookup chain de `resolveMonitorBin()` (`src/store.tsx`)

1. `PORTMON_BIN` (env var) — siempre prioridad.
2. `~/.local/share/pscanner/portmon-<platform>-<arch>` — uso instalado (lo setea `bun run install`).
3. `./monitor/target/{release|debug}/portmon` — fallback dev (path relativo).
Los tipos TS (`src/monitor/protocol.ts`) son espejo manual de `monitor/src/proto.rs` — si cambia uno, cambiar el otro.

## Convenciones

- **Estilo**: minimal, sin frameworks de UI extra. Componentes React directamente con primitivas de OpenTUI (`<box>`, `<text>`).
- **Props de estilo**: usar `style={{ ... }}` en camelCase (`backgroundColor`, `flexDirection`, `borderStyle`).
- **ESM imports** sin extensión: `import { createCliRenderer } from "@opentui/core"`.
- **Sin comentarios innecesarios** en el código.
- **Tokens de color**: importar siempre desde `design.md` (vía opencode.json) — no hardcodear hex codes en componentes nuevos.
- **Comandos del sistema**: para descubrir puertos se usa `lsof` (ver `investigacion-puertos.md`).

## Diseño

El sistema visual completo está definido en [`design.md`](./design.md) y se carga automáticamente como instrucciones via `opencode.json`. Resumen rápido:

- Paleta: 8 colores fijos (`#51576c`, `#e98186`, `#a6d28a`, `#e6c890`, `#8caaec`, `#f2b9e5`, `#82c8be`, `#b5bfe2`).
- Tipografía: monoespaciada (`JetBrains Mono`, `Fira Code`, etc.).
- Fondo base: `colors.base` (`#51576c`). Acentos pastel solo en pequeñas dosis y con rol semántico.
- Tamaño de texto predominante: 12–14px.

Antes de crear un componente o agregar un color, **consultar `design.md`**.

## Gotchas

- `@opentui/react` requiere `await createCliRenderer()` antes de `createRoot(renderer).render(...)`.
- `useKeyboard` consume el evento globalmente; cerrar con `renderer.destroy()` en `Esc`/`q`.
- No introducir dependencias nuevas sin consensuar.
- Mantener la app destructivable con `q` / `Esc` desde cualquier vista.
- `console.log` dentro de la TUI no se ve en terminal: va al console overlay de OpenTUI (toggle con `renderer.console.toggle()`); el stderr del monitor Rust se forwardea ahí.
- Nunca `process.exit()` directo: deja la terminal rota. Usar `renderer.destroy()`.
- El monitor Rust detecta EOF en stdin y se cierra solo; aun así, `MonitorClient.dispose()` envía `shutdown` y hace `kill()` como fallback tras timeout.
