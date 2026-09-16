# Plan: publicación automatizada de `pscanner` en Homebrew (tap propio)

> Documento de auditoría. Decisiones tomadas el 2026-09-15 con el usuario:
>
> 1. Plataformas: **macOS (arm64 + Intel) + Linux (x86_64 + arm64)**.
> 2. Tap en repo nuevo **`FedericoDeniard/homebrew-tap`** (no en este repo).
> 3. Trigger: **push de tag `v*`**.

---

## Estado de partida

- **Build actual**: `cargo build --release` (monitor Rust, `monitor/target/release/portmon`)
  + `Bun.build({ compile })` (TUI self-contained, `dist/pscanner-<os>-<arch>`).
- **Discovery del monitor** en runtime (`src/store.tsx:131`):
  1. `process.env.PORTMON_BIN`
  2. `~/.local/share/pscanner/portmon-<os>-<arch>`
  3. `monitor/target/<profile>/portmon` (dev)
  → Esto permite que la fórmula setee `PORTMON_BIN` con un wrapper sin tocar código.
- **Versión**: `package.json` (1.1.0 al momento de escribir esto), embebida vía `process.env.PORTSCANNER_VERSION`. `--version` ya existe → sirve para el bloque `test` de la fórmula.
- **No hay CI** aún (`.github/` no existe).
- Hay un `pnpm-lock.yaml` sin trackear que sobra (el proyecto usa `bun.lock`).

---

## Arquitectura objetivo

```
git tag v1.2.0 && git push --tags
        │
        ▼
┌─ GitHub Action: release.yml (repo PortScanner) ─────────────────┐
│  job validate: tag == package.json version                      │
│  job build (matrix nativo, sin cross-compile):                  │
│    ├─ macos-14         → darwin-arm64                           │
│    ├─ macos-13         → darwin-x86_64  (Intel)                 │
│    ├─ ubuntu-latest    → linux-x86_64                           │
│    └─ ubuntu-24.04-arm → linux-arm64                           │
│    c/u: bun install → tests → cargo release → bun --compile     │
│        → pscanner_1.2.0_<os>_<arch>.tar.gz (ambos binarios)     │
│        → upload al GitHub Release v1.2.0                        │
│  job tap (needs: build):                                        │
│    → gh release download (los 4 tarballs) → sha256              │
│    → render Formula/pscanner.rb                                 │
│    → push a FedericoDeniard/homebrew-tap (PAT)                  │
└─────────────────────────────────────────────────────────────────┘

Usuario final:
  brew tap federicodeniard/tap
  brew install pscanner
```

---

## Cambios en este repo

### `scripts/package.ts` (nuevo)

Reutiliza la misma lógica que `scripts/install.ts` para invocar `cargo` y `Bun.build({ compile })`,
pero en vez de instalar en `~/.local/share/pscanner` empaqueta los dos binarios en un tarball.

CLI:

```
bun run scripts/package.ts --target <darwin-arm64|darwin-x86_64|linux-x86_64|linux-arm64>
                           [--out <dir>]
                           [--version <x.y.z>]
```

Mapeo target → configuración:

| target        | os     | arch  | `Bun.build` compile target |
| ------------- | ------ | ----- | -------------------------- |
| darwin-arm64  | darwin | arm64 | `bun-darwin-arm64`         |
| darwin-x86_64 | darwin | x64   | `bun-darwin-x64`           |
| linux-x86_64  | linux  | x64   | `bun-linux-x64`            |
| linux-arm64   | linux  | arm64 | `bun-linux-arm64`          |

Salidas:

- `dist/pscanner-<os>-<arch>` (TUI compilada)
- `monitor/target/release/portmon` (monitor Rust)
- `<out>/pscanner_<version>_<target>.tar.gz` con ambos adentro
- `<out>/pscanner_<version>_<target>.sha256` (sha256 del tarball)

### `scripts/gen-formula.ts` (nuevo)

Genera `Formula/pscanner.rb` (o lo escribe a stdout para que el job tap lo redirija).
Inputs por CLI args o env:

| clave              | fuente                                                |
| ------------------ | ----------------------------------------------------- |
| `VERSION`          | tag (`vX.Y.Z` → `X.Y.Z`)                              |
| `URL_DARWIN_ARM64` | release asset                                         |
| `URL_DARWIN_X86_64`| release asset                                         |
| `URL_LINUX_X86_64` | release asset                                         |
| `URL_LINUX_ARM64`  | release asset                                         |
| `SHA_DARWIN_ARM64` | `sha256sum pscanner_X.Y.Z_darwin-arm64.tar.gz`        |
| `SHA_DARWIN_X86_64`| `sha256sum pscanner_X.Y.Z_darwin-x86_64.tar.gz`       |
| `SHA_LINUX_X86_64` | `sha256sum pscanner_X.Y.Z_linux-x86_64.tar.gz`        |
| `SHA_LINUX_ARM64`  | `sha256sum pscanner_X.Y.Z_linux-arm64.tar.gz`         |

CLI:

```
bun run scripts/gen-formula.ts --out Formula/pscanner.rb
# o sin --out, escribe a stdout
```

### `.github/workflows/release.yml` (nuevo)

- **Trigger**: `push: tags: ['v*']`
- **Permisos**: `contents: write` (para crear release y commit).
- **Jobs**:
  - `validate` (ubuntu-latest): chequea `tag == package.json.version` y exporta `version`.
  - `build` (matrix ×4): runner nativo por plataforma, hace `bun install`, tests, build, sube tarball como artifact + a la release.
  - `release` (needs: build): baja todos los artifacts, crea/actualiza `v$VERSION` con `gh release create/upload`.
  - `tap` (needs: release): descarga los 4 tarballs, calcula sha256, corre `gen-formula.ts`, hace checkout de `homebrew-tap` con `TAP_GITHUB_TOKEN`, commit + push.

Secrets necesarios:

- `TAP_GITHUB_TOKEN`: fine-grained PAT con acceso **solo** al repo `homebrew-tap`,
  permiso `Contents: read and write`. (Este secret lo crea el usuario una sola vez.)

### `.gitignore`

Agregar `pnpm-lock.yaml` (huérfano, no es parte del proyecto) y `dist/`.

---

## Fórmula `Formula/pscanner.rb` (plantilla)

```ruby
class Pscanner < Formula
  desc "TUI to view and manage TCP/UDP ports in use"
  homepage "https://github.com/FedericoDeniard/PortScanner"
  version "X.Y.Z"
  license "ISC"

  on_macos do
    on_arm do
      url "https://github.com/FedericoDeniard/PortScanner/releases/download/vX.Y.Z/pscanner_X.Y.Z_darwin_arm64.tar.gz"
      sha256 "..."
    end
    on_intel do
      url "https://github.com/FedericoDeniard/PortScanner/releases/download/vX.Y.Z/pscanner_X.Y.Z_darwin_x86_64.tar.gz"
      sha256 "..."
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/FedericoDeniard/PortScanner/releases/download/vX.Y.Z/pscanner_X.Y.Z_linux_x86_64.tar.gz"
      sha256 "..."
    end
    on_arm do
      url "https://github.com/FedericoDeniard/PortScanner/releases/download/vX.Y.Z/pscanner_X.Y.Z_linux_arm64.tar.gz"
      sha256 "..."
    end
  end

  def install
    os = OS.mac? ? "darwin" : "linux"
    arch = Hardware::CPU.arm? ? "arm64" : "x86_64"
    libexec.install "pscanner-#{os}-#{arch}", "portmon-#{os}-#{arch}"
    (bin/"pscanner").write_env_script libexec/"pscanner-#{os}-#{arch}",
      PORTMON_BIN: libexec/"portmon-#{os}-#{arch}"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pscanner --version")
  end
end
```

`write_env_script` setea `PORTMON_BIN` en el wrapper → el resolver lo pesca en su
primer chequeo. **Cero cambios al código de la app.**

---

## Pasos manuales únicos (fuera del código)

1. Crear repo público **`FedericoDeniard/homebrew-tap`** (puedo hacerlo con
   `gh repo create FedericoDeniard/homebrew-tap --public --description "Homebrew tap for FedericoDeniard tools"`).
2. Crear un **fine-grained PAT** con acceso **solo** a `homebrew-tap`,
   permiso `Contents: read and write`. **Esto lo hace el usuario en
   <https://github.com/settings/tokens?type=beta>**. No requiere aprobación de nadie.
3. Guardar el PAT como secret `TAP_GITHUB_TOKEN` en el repo PortScanner
   (lo puedo hacer yo con `gh secret set TAP_GITHUB_TOKEN` cuando me lo pases).
4. Commit inicial en `homebrew-tap` (lo empuja la primera release, o un README inicial manual).

---

## Riesgos y decisiones consideradas

- **Sin cross-compilation**: cargo compila nativo en cada runner. macos-13 =
  Intel (si GitHub lo depreca, se migra a `macos-15-intel` — cambio de 1 línea).
- **Tests como gate**: `bun test` + `cargo test` se corren antes de publicar.
- **`pscanner update` / `pscanner uninstall` bajo brew**: no aplican (esos subcomandos
  apuntan a `~/.local/share/pscanner`). Se documenta en caveats o se detecta instalación
  brew más adelante (no incluido en este PR para mantenerlo mínimo).
- **Idempotencia**: re-pushear el mismo tag regenera assets y fórmula sin romper nada.
- **Verificación end-to-end**: tras el primer tag, valido localmente
  `brew tap federicodeniard/tap && brew install pscanner && pscanner --version`.

---

## Orden de ejecución (este PR)

1. ✅ Escribir este plan en `BREW_RELEASE.md`.
2. ✅ `scripts/package.ts` + prueba local del tarball.
3. ✅ `scripts/gen-formula.ts` + revisión de la fórmula generada.
4. ✅ `.github/workflows/release.yml`.
5. ✅ `.gitignore` (descartar `pnpm-lock.yaml` huérfano, ignorar `dist/`).
6. ✅ Documentar en `README.md` y `AGENTS.md`.
7. ✅ (Por el usuario) Crear PAT + secret. (Por mí, una vez) Crear `homebrew-tap`.
8. ✅ Tag de prueba `v1.1.1` → verificar pipeline completo.

---

# Flujo operacional

Cómo cortar un release real, monitorearlo y resolver problemas.

## Cutting a release

```bash
# 1. bump version (commit + tag happen here)
bun pm version patch   # o minor / major; o editar package.json + git tag manualmente

# 2. push commit + tag — la Action se encarga del resto
git push origin main --follow-tags
```

`bun pm version patch` actualiza `package.json` y crea el commit (`vX.Y.Z`) y el tag en un solo paso. `--follow-tags` los pushea atómicamente.

La Action corre cuatro jobs en secuencia:

```
validate (tag == package.json version)
   └── build matrix en paralelo:
         macos-14         → darwin-arm64
         macos-15-intel   → darwin-x86_64
         ubuntu-latest    → linux-x86_64
         ubuntu-24.04-arm → linux-arm64
       c/u: bun test + cargo test, luego package.ts emite
            pscanner_<ver>_<target>.tar.gz + .sha256
   └── release: empaqueta los 4 artifacts en un GitHub Release vX.Y.Z
   └── tap: regenera Formula/pscanner.rb en FedericoDeniard/homebrew-tap
            con los nuevos urls + sha256s, después commit & push
```

Todos los builds gatean con tests: si `bun test` o `cargo test` falla, no se publica nada.

## Watching the pipeline

```bash
gh run list --workflow release --limit 1
gh run watch $(gh run list --workflow release --limit 1 --json databaseId -q '.[0].databaseId')
```

O abrir el run URL en browser — `gh run view <id> --web`.

Cuando termina, verificar ambos lados:

```bash
gh release view vX.Y.Z --repo FedericoDeniard/PortScanner
gh api repos/FedericoDeniard/homebrew-tap/contents/Formula/pscanner.rb \
    -q .content | base64 -d
```

## Local dry-run (sin GitHub)

Construir un solo target localmente sin pushear:

```bash
bun run scripts/package.ts --target darwin-arm64 --version X.Y.Z --out release
```

Produce `release/pscanner_X.Y.Z_darwin-arm64.tar.gz` + `.sha256`. Útil para
sanity-check del binario antes de taggear.

## Secret requerido

`TAP_GITHUB_TOKEN` — fine-grained PAT con **Contents: read and write** acceso
**solo** a `FedericoDeniard/homebrew-tap`. Creado una vez en
<https://github.com/settings/tokens?type=beta> y guardado como secret del repo
PortScanner con `gh secret set TAP_GITHUB_TOKEN --repo
FedericoDeniard/PortScanner`. El default `GITHUB_TOKEN` no puede llegar al tap
repo (es otro repo). Si el job `tap` falla con 403, el PAT expiró o perdió
acceso — regenerar y re-set.

## Troubleshooting

| Síntoma | Causa | Fix |
| --- | --- | --- |
| `validate` falla: tag version != package.json | El tag apunta a un commit donde la versión no matchea | Correr `bun pm version patch` antes de `git push`; o amendear el commit para que coincida |
| Un job `build` queda en cola infinito y se cancela | El runner fue deprecado / removido (ej. `macos-13` en 2025) | Reemplazar el `runs-on:` en el matrix de `.github/workflows/release.yml` con el runner actual (`macos-15-intel`, `macos-14-large`, etc.). Referencia: <https://github.com/actions/runner-images> |
| `release` falla: `failed to run git: fatal: not a git repository` | El job `release` no tiene `actions/checkout`, entonces `gh release view` no puede resolver contexto git | Asegurar que `- uses: actions/checkout@v4` sea el primer step de `release` |
| `tap` falla: `release not found` | `VERSION` env var está vacío | El job `tap` debe declarar `needs: [validate, release]` (no solo `release`) para que `needs.validate.outputs.version` resuelva |
| `tap` sale verde pero `Formula/pscanner.rb` no aparece en el tap | `git diff --quiet Formula/pscanner.rb` retorna 0 para archivos untracked, así que el commit se saltea | Usar `git diff --cached --quiet` después de `git add` |
| La fórmula del tap queda igual después de un release | `gh release download` no encontró el release (a menudo porque el previo estaba en draft) | `gh release edit vX.Y.Z --repo FedericoDeniard/PortScanner --draft=false` |
| Brew del usuario crashea con `JSON::Ext::Generator::State` / `default_sort_keys_proc=` | Bug en su Homebrew 7.0.2 — gem `json-3.0.2` roto en `vendor/bundle` (no es nuestra fórmula) | El usuario corre `HOMEBREW_NO_BOOTSNAP=1 brew install pscanner`, o `gem pristine json`, o reinstala brew |

## Re-publicar la misma versión

No. Si una release salió mal, **bumpear a una nueva versión**:

```bash
bun pm version patch   # 1.1.2 → 1.1.3
git push --follow-tags
```

Re-tag del mismo commit (`git tag -f vX.Y.Z && git push --follow-tags --force`)
funciona pero ensucia la historia del Release y confunde la comparación de
versiones de brew.

## Rolling back una release mala

```bash
gh release delete vX.Y.Z --repo FedericoDeniard/PortScanner --yes
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

Después revertir la fórmula del tap en `FedericoDeniard/homebrew-tap` al
commit previo conocido-bueno (la historia de git del homebrew-tap repo es el
audit trail).

## Cambios en la fórmula o el workflow

- **Fórmula**: editar `scripts/gen-formula.ts` (no `Formula/pscanner.rb` en el
  tap — eso se regenera siempre).
- **Workflow**: editar `.github/workflows/release.yml` y pushear a main. El
  próximo tag usa el workflow nuevo.
6. Documentar en `README.md` y `AGENTS.md`.
7. (Por el usuario) Crear PAT + secret. (Por mí, una vez) Crear `homebrew-tap`.
8. Tag de prueba `v1.1.0` → verificar pipeline completo.
9. Verificación local: `brew tap federicodeniard/tap && brew install pscanner`.
