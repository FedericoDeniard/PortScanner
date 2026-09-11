# Research: Ports in use on my Mac

Date: 2026-09-10

## Goal

Find out which ports are in use on the machine, what information can be obtained from them, and how to distinguish processes started by the user from those belonging to the system.

## Key commands

| Command | What it shows |
|---|---|
| `lsof -iTCP -sTCP:LISTEN -P -n` | TCP ports waiting for connections (local servers) |
| `lsof -iUDP -P -n` | Open UDP sockets |
| `lsof -iTCP -sTCP:ESTABLISHED -P -n` | Active connections to the internet (who is talking to whom) |
| `lsof -i :<port> -P -n` | Which process uses a specific port |
| `ps -p <PID> -o pid,comm,args` | Full path of a process's executable |
| `netstat -anv -p tcp` | Native macOS alternative with low-level detail |

Useful `lsof` flags:

- `-P`: show port numbers instead of service names
- `-n`: do not resolve DNS (much faster)
- `sudo`: also allow seeing processes from root and other users

## Information obtained per socket

- **COMMAND**: process name (e.g. `Spotify`, `node`, `OrbStack`)
- **PID**: process ID (useful to kill it with `kill <PID>`)
- **USER**: user that owns the process
- **Listen address**:
  - `*:<port>` → listens on all interfaces (reachable from the network)
  - `127.0.0.1:<port>` → localhost only (safer)
- **Port**: port number
- **Established connections**: remote IP and port → which servers each app is connected to

## Machine state at the time of the research

- **31** TCP ports in LISTEN
- **57** open UDP sockets
- **53** outgoing TCP established connections

## How to tell who started each process

Three signals are combined: the owning user, the executable path, and whether `sudo` is required.

| Executable path | Classification |
|---|---|
| `/System/...`, `/usr/libexec/...` | System (macOS) — do not touch |
| `/Applications/...` | Apps installed by the user |
| `node /Users/<user>/...` (projects folder) | Processes started manually (dev servers, scripts) |

### Classification of what was found

**Started by the user (dev):**

| Process | PID | Ports | Detail |
|---|---|---|---|
| `node` | 22685 | 3000, 3142 | Vite dev server (`53stations/apps/hub`) |
| `node` | 1012 | 5173, 5350 | node process in Orca workspace |
| `OrbStack Helper` | 57807 | 54321–54327 | Docker/containers |

**User apps (in background):**

| Process | Ports | Detail |
|---|---|---|
| `Spotify` | 7768, 57621, 50031 | Includes 5353/1900 UDP (mDNS, SSDP) |
| `Raycast` | 7265 | Localhost only |
| `Orca` | 6768, 64469 | — |

**macOS system (do not touch):**

| Process | Path | Ports | Function |
|---|---|---|---|
| `rapportd` | `/usr/libexec/` | 49815 | AirDrop/Handoff |
| `ControlCenter` | `/System/Library/CoreServices/` | 5000, 7000 | AirPlay |
| `sharingd`, `identityservicesd` | system | several UDP | Sharing/iCloud |

## Outgoing connections detected

Examples of ESTABLISHED connections to the internet:

- `opencode` → 172.65.90.23:443
- `Spotify` → multiple IPs (35.186.224.x, 142.251.x.x — Google Cloud)
- `Meta Quest` → 57.144.206.x:443
- `node` → 104.16.1.34:443 (multiple connections)

## Quick rules

- Without `sudo`, `lsof` only shows processes of the current user.
- If `args` points to a projects folder → the user started it, it can be killed without issue.
- If it is in `/System` or `/usr/libexec` → it is a system process, leave it alone.
- To free a port: `lsof -i :<port> -P -n` → get PID → `kill <PID>`.