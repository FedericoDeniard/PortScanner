#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve, join } from "node:path"

const PROJECT_ROOT = resolve(import.meta.dir, "..")
const DIST_DIR = join(PROJECT_ROOT, "dist")
const MONITOR_SRC = join(PROJECT_ROOT, "monitor", "target", "release", "portmon")

const TARGETS = {
  "darwin-arm64":  { os: "darwin", arch: "arm64", bunTarget: "bun-darwin-arm64" },
  "darwin-x86_64": { os: "darwin", arch: "x64",   bunTarget: "bun-darwin-x64"   },
  "linux-x86_64":  { os: "linux",  arch: "x64",   bunTarget: "bun-linux-x64"    },
  "linux-arm64":   { os: "linux",  arch: "arm64", bunTarget: "bun-linux-arm64"  },
} as const

type Target = keyof typeof TARGETS

function parseArgs(argv: string[]) {
  const out: { target?: Target; out?: string; version?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--target") out.target = argv[++i] as Target
    else if (a === "--out") out.out = argv[++i]
    else if (a === "--version") out.version = argv[++i]
    else if (a === "--help" || a === "-h") {
      console.log(
        `usage: bun run scripts/package.ts --target <${Object.keys(TARGETS).join("|")}> [--out <dir>] [--version <x.y.z>]`,
      )
      process.exit(0)
    } else {
      throw new Error(`unknown arg: ${a}`)
    }
  }
  return out
}

function readPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"),
  ) as { version?: string }
  if (!pkg.version) throw new Error("package.json has no version")
  return pkg.version
}

function log(msg: string) {
  process.stdout.write(`${msg}\n`)
}

async function spawnChecked(cmd: string[], opts: { cwd?: string } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`${cmd.join(" ")} exited with ${code}`)
  }
}

async function buildMonitor() {
  log("▸ cargo build --release")
  await spawnChecked([
    "cargo",
    "build",
    "--release",
    "--manifest-path",
    "monitor/Cargo.toml",
  ])
  if (!existsSync(MONITOR_SRC)) {
    throw new Error(`portmon binary not found at ${MONITOR_SRC}`)
  }
}

async function buildTUI(target: Target) {
  const cfg = TARGETS[target]
  log(`▸ bun build --compile (target=${cfg.bunTarget})`)
  mkdirSync(DIST_DIR, { recursive: true })
  const result = await Bun.build({
    entrypoints: [join(PROJECT_ROOT, "index.tsx")],
    target: "bun",
    compile: {
      target: cfg.bunTarget,
      outfile: join(DIST_DIR, `pscanner-${cfg.os}-${cfg.arch}`),
    },
    minify: true,
    define: {
      "process.env.PORTSCANNER_VERSION": JSON.stringify(version),
    },
  })
  if (!result.success) {
    throw new Error(
      `bun build failed:\n${result.logs.map((l) => l.message).join("\n")}`,
    )
  }
}

let version = ""

async function packageRelease(target: Target, outDir: string) {
  const cfg = TARGETS[target]
  const tuiName = `pscanner-${cfg.os}-${cfg.arch}`
  const monName = `portmon-${cfg.os}-${cfg.arch}`
  const tuiSrc = join(DIST_DIR, tuiName)
  const monSrc = MONITOR_SRC

  if (!existsSync(tuiSrc)) throw new Error(`missing TUI binary: ${tuiSrc}`)
  if (!existsSync(monSrc)) throw new Error(`missing monitor binary: ${monSrc}`)

  mkdirSync(outDir, { recursive: true })
  const staging = join(outDir, `.staging-${target}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  await Bun.$`cp ${tuiSrc} ${join(staging, tuiName)}`.quiet()
  await Bun.$`cp ${monSrc} ${join(staging, monName)}`.quiet()
  await Bun.$`chmod +x ${join(staging, tuiName)} ${join(staging, monName)}`.quiet()

  const tarball = join(outDir, `pscanner_${version}_${target}.tar.gz`)
  rmSync(tarball, { force: true })
  await Bun.$`tar -C ${staging} -czf ${tarball} ${tuiName} ${monName}`.quiet()
  rmSync(staging, { recursive: true, force: true })

  const sha = (await Bun.$`shasum -a 256 ${tarball}`.text())
    .trim()
    .split(/\s+/)[0]
  const shaFile = `${tarball}.sha256`
  writeFileSync(shaFile, `${sha}  pscanner_${version}_${target}.tar.gz\n`)

  log(`▸ packaged ${tarball}`)
  log(`  sha256: ${sha}`)
  return { tarball, sha }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.target || !(args.target in TARGETS)) {
    throw new Error(
      `--target is required (one of: ${Object.keys(TARGETS).join(", ")})`,
    )
  }
  version = args.version ?? readPackageVersion()
  const outDir = resolve(args.out ?? join(PROJECT_ROOT, "release"))

  log(`packaging pscanner ${version} for ${args.target}`)
  await buildMonitor()
  await buildTUI(args.target)
  const { sha } = await packageRelease(args.target, outDir)

  log(`\n✓ done.`)
  log(`  version:    ${version}`)
  log(`  target:     ${args.target}`)
  log(`  sha256:     ${sha}`)
}

await main()
