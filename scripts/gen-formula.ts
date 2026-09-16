#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const TARGETS = [
  "darwin-arm64",
  "darwin-x86_64",
  "linux-x86_64",
  "linux-arm64",
] as const

type Target = (typeof TARGETS)[number]

function envFlag(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`missing env var ${key}`)
  return v
}

function template(input: {
  version: string
  urls: Record<Target, string>
  shas: Record<Target, string>
}): string {
  const tag = `v${input.version}`
  const releaseBase =
    "https://github.com/FedericoDeniard/PortScanner/releases/download"
  const url = (t: Target) =>
    `${releaseBase}/${tag}/pscanner_${input.version}_${t}.tar.gz`

  return `class Pscanner < Formula
  desc "TUI to view and manage TCP/UDP ports in use"
  homepage "https://github.com/FedericoDeniard/PortScanner"
  url "${url("darwin-arm64")}"
  version "${input.version}"
  license "ISC"

  on_macos do
    on_arm do
      url "${url("darwin-arm64")}"
      sha256 "${input.shas["darwin-arm64"]}"
    end
    on_intel do
      url "${url("darwin-x86_64")}"
      sha256 "${input.shas["darwin-x86_64"]}"
    end
  end

  on_linux do
    on_intel do
      url "${url("linux-x86_64")}"
      sha256 "${input.shas["linux-x86_64"]}"
    end
    on_arm do
      url "${url("linux-arm64")}"
      sha256 "${input.shas["linux-arm64"]}"
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
`
}

function parseArgs(argv: string[]) {
  const out: { out?: string; version?: string; urls?: string; shas?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out") out.out = argv[++i]
    else if (a === "--version") out.version = argv[++i]
    else if (a === "--urls") out.urls = argv[++i]
    else if (a === "--shas") out.shas = argv[++i]
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: gen-formula.ts [--version X.Y.Z] [--urls <file>] [--shas <file>] [--out <file>]\n" +
          "Reads VERSION, URL_<TARGET>, SHA_<TARGET> from env if not given via flags.",
      )
      process.exit(0)
    } else {
      throw new Error(`unknown arg: ${a}`)
    }
  }
  return out
}

function readKeyFile(path: string): Record<string, string> {
  const text = readFileSync(path, "utf8")
  const map: Record<string, string> = {}
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) map[m[1]] = m[2]
  }
  return map
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const version = args.version ?? envFlag("VERSION")

  let urls: Record<string, string> = {}
  let shas: Record<string, string> = {}
  if (args.urls) urls = readKeyFile(args.urls)
  if (args.shas) shas = readKeyFile(args.shas)

  const finalUrls: Record<Target, string> = {} as Record<Target, string>
  const finalShas: Record<Target, string> = {} as Record<Target, string>
  for (const t of TARGETS) {
    const envKey = `URL_${t.replace(/-/g, "_").toUpperCase()}`
    const shaEnvKey = `SHA_${t.replace(/-/g, "_").toUpperCase()}`
    finalUrls[t] = urls[t] ?? process.env[envKey] ?? ""
    finalShas[t] = shas[t] ?? process.env[shaEnvKey] ?? ""
    if (!finalUrls[t]) throw new Error(`missing URL for ${t}`)
    if (!finalShas[t]) throw new Error(`missing SHA for ${t}`)
  }

  const out = template({ version, urls: finalUrls, shas: finalShas })
  if (args.out) {
    const path = resolve(args.out)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, out)
    process.stderr.write(`▸ wrote ${path}\n`)
  } else {
    process.stdout.write(out)
  }
}

await main()
