#!/usr/bin/env bun
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir, platform, arch } from "node:os"
import { join, resolve } from "node:path"

const TARGET = `${platform()}-${arch()}`
const HOME = homedir()
const SHARE_DIR = join(HOME, ".local", "share", "pscanner")
const BIN_DIR = join(HOME, ".local", "bin")
const CONFIG_PATH = join(SHARE_DIR, "config.json")

type Config = { sourceDir: string; target: string }
function readConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config
  } catch {
    return null
  }
}

const configSourceDir = readConfig()?.sourceDir
const PROJECT_ROOT =
  configSourceDir && existsSync(join(configSourceDir, "package.json"))
    ? configSourceDir
    : resolve(import.meta.dir, "..")

const EXE_SUFFIX = platform() === "win32" ? ".exe" : ""
const TUI_BIN = `pscanner-${TARGET}${EXE_SUFFIX}`
const MON_BIN = `portmon-${TARGET}${EXE_SUFFIX}`

const DIST_DIR = join(PROJECT_ROOT, "dist")
const MONITOR_SRC = join(
  PROJECT_ROOT,
  "monitor",
  "target",
  "release",
  `portmon${EXE_SUFFIX}`,
)
const TUI_SRC = join(DIST_DIR, TUI_BIN)

function log(msg: string) {
  process.stdout.write(`${msg}\n`)
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true })
}

function relink(linkPath: string, target: string) {
  if (existsSync(linkPath)) {
    try {
      unlinkSync(linkPath)
    } catch {
      rmSync(linkPath, { force: true })
    }
  }
  symlinkSync(target, linkPath)
}

function readPackageVersion(): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"),
    ) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

async function buildMonitor() {
  log(`▸ cargo build --release (target=${TARGET})`)
  const proc = Bun.spawn(
    ["cargo", "build", "--release", "--manifest-path", "monitor/Cargo.toml"],
    { cwd: PROJECT_ROOT, stdout: "inherit", stderr: "inherit" },
  )
  const code = await proc.exited
  if (code !== 0) throw new Error(`cargo build failed (exit ${code})`)
  if (!existsSync(MONITOR_SRC)) {
    throw new Error(`portmon binary not found at ${MONITOR_SRC}`)
  }
}

async function buildTUI() {
  log(`▸ bun build --compile (target=bun-${TARGET})`)
  ensureDir(DIST_DIR)
  const result = await Bun.build({
    entrypoints: [join(PROJECT_ROOT, "index.tsx")],
    target: "bun",
    compile: {
      target: `bun-${platform()}-${arch()}`,
      outfile: TUI_SRC,
    },
    minify: true,
    define: {
      "process.env.PORTSCANNER_VERSION": JSON.stringify(
        readPackageVersion() ?? "0.0.0",
      ),
    },
  })
  if (!result.success) {
    const messages = result.logs.map((l) => l.message).join("\n")
    throw new Error(`bun build failed:\n${messages}`)
  }
  if (!existsSync(TUI_SRC)) {
    throw new Error(`compiled TUI binary not found at ${TUI_SRC}`)
  }
}

function installBinaries() {
  log(`▸ installing to ${SHARE_DIR}`)
  ensureDir(SHARE_DIR)
  copyFileSync(MONITOR_SRC, join(SHARE_DIR, MON_BIN))
  copyFileSync(TUI_SRC, join(SHARE_DIR, TUI_BIN))
  copyFileSync(
    join(PROJECT_ROOT, "scripts", "install.ts"),
    join(SHARE_DIR, "install.ts"),
  )
}

function writeConfig() {
  const config: Config = { sourceDir: PROJECT_ROOT, target: TARGET }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

function installLauncher() {
  ensureDir(BIN_DIR)
  relink(join(BIN_DIR, "pscanner"), join(SHARE_DIR, TUI_BIN))
}

function checkPath() {
  const pathDirs = (process.env.PATH ?? "").split(":")
  if (pathDirs.includes(BIN_DIR)) return
  log(`\n⚠  ${BIN_DIR} is not on your $PATH. Add it to ~/.zshrc:`)
  log(`   export PATH="${BIN_DIR}:$PATH"\n`)
}

async function smokeTest() {
  log("▸ smoke test")
  const proc = Bun.spawn([join(BIN_DIR, "pscanner"), "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(proc.stdout).text()
  const err = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`smoke test failed (exit ${code}): ${err.trim()}`)
  }
  log(`  ${out.trim()}`)
}

async function main() {
  log(`installing pscanner (target=${TARGET})`)
  if (PROJECT_ROOT !== resolve(import.meta.dir, "..")) {
    log(`  source dir: ${PROJECT_ROOT}`)
  }
  await buildMonitor()
  await buildTUI()
  installBinaries()
  writeConfig()
  installLauncher()
  checkPath()
  await smokeTest()
  log("\n✓ done. Run `pscanner` from anywhere.")
  log("  Use `pscanner update` after making changes.")
  log("  Use `pscanner uninstall` to remove it.")
}

await main()
