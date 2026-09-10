# Investigación: Puertos en uso en mi Mac

Fecha: 2026-09-10

## Objetivo

Saber qué puertos están en uso en la máquina, qué información se puede obtener de ellos y cómo distinguir los procesos levantados por el usuario de los del sistema.

## Comandos clave

| Comando | Qué muestra |
|---|---|
| `lsof -iTCP -sTCP:LISTEN -P -n` | Puertos TCP esperando conexiones (servidores locales) |
| `lsof -iUDP -P -n` | Sockets UDP abiertos |
| `lsof -iTCP -sTCP:ESTABLISHED -P -n` | Conexiones activas hacia internet (quién habla con quién) |
| `lsof -i :<puerto> -P -n` | Qué proceso usa un puerto puntual |
| `ps -p <PID> -o pid,comm,args` | Ruta completa del ejecutable de un proceso |
| `netstat -anv -p tcp` | Alternativa nativa de macOS con detalle de bajo nivel |

Flags útiles de `lsof`:

- `-P`: muestra números de puerto en vez de nombres de servicio
- `-n`: no resuelve DNS (mucho más rápido)
- `sudo`: permite ver también procesos de root y otros usuarios

## Información que se obtiene por cada socket

- **COMMAND**: nombre del proceso (ej: `Spotify`, `node`, `OrbStack`)
- **PID**: ID del proceso (útil para matarlo con `kill <PID>`)
- **USER**: usuario dueño del proceso
- **Dirección de escucha**:
  - `*:<puerto>` → escucha en todas las interfaces (accesible desde la red)
  - `127.0.0.1:<puerto>` → solo localhost (más seguro)
- **Puerto**: número de puerto
- **Conexiones establecidas**: IP y puerto remoto → a qué servidores está conectada cada app

## Estado de la máquina al momento de la investigación

- **31** puertos TCP en LISTEN
- **57** sockets UDP abiertos
- **53** conexiones TCP establecidas hacia afuera

## Cómo distinguir quién levantó cada proceso

Se combinan 3 señales: el usuario dueño, la ruta del ejecutable y si requiere `sudo`.

| Ruta del ejecutable | Clasificación |
|---|---|
| `/System/...`, `/usr/libexec/...` | Sistema (macOS) — no tocar |
| `/Applications/...` | Apps instaladas por el usuario |
| `node /Users/<usuario>/...` (carpeta de proyectos) | Procesos levantados manualmente (dev servers, scripts) |

### Clasificación de lo encontrado

**Levantados por el usuario (dev):**

| Proceso | PID | Puertos | Detalle |
|---|---|---|---|
| `node` | 22685 | 3000, 3142 | Vite dev server (`53stations/apps/hub`) |
| `node` | 1012 | 5173, 5350 | Proceso node en workspace de Orca |
| `OrbStack Helper` | 57807 | 54321–54327 | Docker/containers |

**Apps del usuario (en background):**

| Proceso | Puertos | Detalle |
|---|---|---|
| `Spotify` | 7768, 57621, 50031 | Incluye 5353/1900 UDP (mDNS, SSDP) |
| `Raycast` | 7265 | Solo localhost |
| `Orca` | 6768, 64469 | — |

**Sistema macOS (no tocar):**

| Proceso | Ruta | Puertos | Función |
|---|---|---|---|
| `rapportd` | `/usr/libexec/` | 49815 | AirDrop/Handoff |
| `ControlCenter` | `/System/Library/CoreServices/` | 5000, 7000 | AirPlay |
| `sharingd`, `identityservicesd` | sistema | UDP varios | Compartir/iCloud |

## Conexiones salientes detectadas

Ejemplos de conexiones ESTABLISHED hacia internet:

- `opencode` → 172.65.90.23:443
- `Spotify` → múltiples IPs (35.186.224.x, 142.251.x.x — Google Cloud)
- `Meta Quest` → 57.144.206.x:443
- `node` → 104.16.1.34:443 (múltiples conexiones)

## Reglas rápidas

- Sin `sudo`, `lsof` solo muestra procesos del propio usuario.
- Si `args` apunta a una carpeta de proyectos → lo levantó el usuario, se puede matar sin problema.
- Si está en `/System` o `/usr/libexec` → es del sistema, dejarlo quieto.
- Para liberar un puerto: `lsof -i :<puerto> -P -n` → obtener PID → `kill <PID>`.
