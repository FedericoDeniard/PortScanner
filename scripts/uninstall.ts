#!/usr/bin/env bun
import { existsSync, rmSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const HOME = homedir()
const SHARE_DIR = join(HOME, ".local", "share", "pscanner")
const BIN_DIR = join(HOME, ".local", "bin")
const BIN_LINKS = [join(BIN_DIR, "pscanner")]

function log(m: string) {
  process.stdout.write(`${m}\n`)
}

let removed = 0
for (const link of BIN_LINKS) {
  if (existsSync(link)) {
    try {
      unlinkSync(link)
      log(`✓ removed ${link}`)
      removed++
    } catch {
      rmSync(link, { force: true })
      log(`✓ removed ${link}`)
      removed++
    }
  }
}

if (existsSync(SHARE_DIR)) {
  rmSync(SHARE_DIR, { recursive: true, force: true })
  log(`✓ removed ${SHARE_DIR}`)
  removed++
}

if (removed === 0) {
  log("nothing to remove — pscanner is not installed.")
} else {
  log("\ndone.")
}
