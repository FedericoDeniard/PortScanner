---
name: release
description: Cut, watch and troubleshoot pscanner releases. Use when bumping version, pushing a tag, monitoring the GitHub Actions release workflow, regenerating the Homebrew formula, or rolling back a bad release. Triggers on requests like "cut a release", "publish a new version", "bump version", "tag a release", "watch the pipeline", "the release failed", or any Homebrew tap update question.
metadata:
  references: homebrew-tap, github-actions, semantic-versioning, npm-version, rollback
---

# Release flow for pscanner

`pscanner` is published to a Homebrew tap (`FedericoDeniard/homebrew-tap`) and a
GitHub Release (`FedericoDeniard/PortScanner`) by a single tag-driven GitHub
Actions workflow. The full design lives in [`BREW_RELEASE.md`](../../BREW_RELEASE.md);
this skill is a condensed operational reference for cutting releases and
fixing the common pipeline failures.

## Cutting a release

```bash
# 1. bump version (commit + tag in one step)
bun pm version patch   # or minor / major

# 2. push commit + tag — the Action runs end-to-end
git push origin main --follow-tags
```

The tag MUST match `package.json` version — `validate` fails otherwise.

## Pipeline overview

```
validate (tag == package.json version)
   └── build matrix in parallel:
         macos-14         → darwin-arm64
         macos-15-intel   → darwin-x86_64
         ubuntu-latest    → linux-x86_64
         ubuntu-24.04-arm → linux-arm64
   └── release: publishes GitHub Release vX.Y.Z with 4 tarballs + sha256s
   └── tap: regenerates Formula/pscanner.rb in homebrew-tap, commits, pushes
```

Tests gate every build (`bun test` + `cargo test`). A failing test blocks the
release.

## Watching

```bash
gh run list --workflow release --limit 1
gh run watch $(gh run list --workflow release --limit 1 --json databaseId -q '.[0].databaseId')
# or open in browser:
gh run view <id> --web
```

Verify after success:

```bash
gh release view vX.Y.Z --repo FedericoDeniard/PortScanner
gh api repos/FedericoDeniard/homebrew-tap/contents/Formula/pscanner.rb \
    -q .content | base64 -d
```

## Local dry-run

Build a single target without touching GitHub:

```bash
bun run scripts/package.ts --target darwin-arm64 --version X.Y.Z --out release
```

Produces `release/pscanner_X.Y.Z_darwin-arm64.tar.gz` + `.sha256`. Useful for
sanity-checking the binary before tagging.

## Required secret

`TAP_GITHUB_TOKEN` — fine-grained PAT scoped **only** to
`FedericoDeniard/homebrew-tap` with `Contents: read and write`. Saved as a
repository secret in PortScanner. The default `GITHUB_TOKEN` cannot reach
another repo. If the `tap` job 403s, the PAT expired — regenerate it at
<https://github.com/settings/tokens?type=beta> and re-run:

```bash
gh secret set TAP_GITHUB_TOKEN --repo FedericoDeniard/PortScanner
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `validate`: tag version != package.json | Tag doesn't match the commit's package.json | Bump with `bun pm version patch` first, then push |
| A `build` job queues forever, then is cancelled | Runner was deprecated/removed (e.g. `macos-13` retired in 2025) | Update the `runs-on:` label in the workflow matrix. Reference: <https://github.com/actions/runner-images> |
| `release`: `failed to run git: fatal: not a git repository` | `release` job has no `actions/checkout`, `gh` can't resolve git context | Add `- uses: actions/checkout@v4` as the first step of `release` |
| `tap`: `release not found` | `VERSION` env var empty in `tap` | `tap` must declare `needs: [validate, release]` (not just `release`) so `needs.validate.outputs.version` resolves |
| `tap` succeeds but formula never lands in the tap | `git diff --quiet <path>` returns 0 for untracked files → skip-commit | Use `git diff --cached --quiet` after `git add` |
| Tap formula unchanged after a release | Previous release was a draft; `gh release download` failed | `gh release edit vX.Y.Z --repo FedericoDeniard/PortScanner --draft=false` |
| User's brew crashes with `JSON::Ext::Generator::State` / `default_sort_keys_proc=` | Bug in **their** Homebrew 7.0.2 install — broken `json-3.0.2` gem; not our formula | Tell them `HOMEBREW_NO_BOOTSNAP=1 brew install pscanner`, or `gem pristine json`, or reinstall brew |

## Re-publishing or rolling back

**Don't re-tag.** Bump and push a new version:

```bash
bun pm version patch   # 1.1.2 → 1.1.3
git push --follow-tags
```

Force-pushing the same tag (`git tag -f vX.Y.Z && git push --follow-tags --force`)
works but pollutes Release history and confuses `brew` version comparison.

Full rollback:

```bash
gh release delete vX.Y.Z --repo FedericoDeniard/PortScanner --yes
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

Then revert `Formula/pscanner.rb` in `FedericoDeniard/homebrew-tap` to the
last known-good commit (the tap repo's git history is the audit trail).

## Editing the formula or workflow

- **Formula**: edit `scripts/gen-formula.ts`. The tap file is always
  regenerated; don't edit it by hand.
- **Workflow**: edit `.github/workflows/release.yml` and push to `main`. The
  next tag uses the new workflow.

## Cross-references

- [`BREW_RELEASE.md`](../../BREW_RELEASE.md) — full plan + operational flow +
  audit trail (the canonical doc).
- [`scripts/package.ts`](../../scripts/package.ts) — build + tarball + sha256.
- [`scripts/gen-formula.ts`](../../scripts/gen-formula.ts) — formula renderer.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — the
  pipeline itself.
