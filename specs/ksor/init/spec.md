---
status: ratified
date: 2026-08-18
claim: the five-minute promise — one human command yields a governed corpus, its agent kit, and a working site; everything after init is the agent's job
evidence: research/scaffold-structure.md · research/primitives-proposal.md §1 · research/handover-vsor-to-ksor.md
---

# ksor init

The only verb a human types (decision 7). Ratified from the design
conversation of 2026-08-18; the predecessor's init spec served as the
clause-by-clause checklist — every clause crossed, was rewritten for the new
shape, or was dropped with the reason recorded in
`research/scaffold-structure.md`. Where this spec and the code disagree, the
code wins and this page is corrected in the same commit.

## Observable contract

**Invocation.** `ksor init <name>` with `<name>` matching
`^[a-z0-9][a-z0-9-]{0,62}$`; `ksor init .` scaffolds into an empty-enough
current directory (the company-monorepo path); bare `ksor init` prints one
instructional screen and exits `0` — an unattended agent must never scaffold
into an unknown cwd by accident.

**Refusals** exit `1`, first stderr line a stable slug: `error: bad-name`,
`error: exists`, `error: blocked` (target dir has unrelated content),
`error: nested` (an ancestor directory contains `instance.md`);
`error: unsupported-platform` exits `3`. A parent pnpm workspace whose globs
would swallow the project produces a warning, not a refusal.

**Negative contract.** No network I/O. Never runs a package manager (the
handoff text carries `pnpm install && pnpm dev`). Deterministic: the same
ksor version and name produce byte-identical trees — enforced by shipping
every emitted byte (the lockfile included) as template content in the ksor
package. Atomic: staged in a sibling `.ksor-init-<random>/` then renamed
(`init .`: ordered writes with rollback); a failed init leaves the
filesystem as found; stale stage dirs are reported, never deleted. Runs
`git init` unless already inside a repository; never stages or commits. No
symlinks anywhere in the output.

**The emitted tree** (the closed root set — frozen at birth; its one named
later arrival is `build.lock.json`, committed, written only by `ksor build`):

| Path                                                      | Contract                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` | workspace at root; scripts proxy so `pnpm dev` works at root; exact pins + `packageManager`; `ksor` as devDependency; `minimumReleaseAge`; empty build-scripts allowlist                                           |
| `AGENTS.md`                                               | the project constitution: the two worlds, command conventions, record-purity rules; critical rule 1 = the site never contains authored content                                                                     |
| `CLAUDE.md`                                               | one line, `@AGENTS.md` — a file, never a symlink; must never grow content                                                                                                                                          |
| `README.md`                                               | one page: record vs system, and the grant sentence (templates are MIT-0 — decision 10; no LICENSE file is ever emitted)                                                                                            |
| `instance.md`                                             | format 1 frontmatter: `format`, `name`, `ksor.requires`, `ksor.scaffolded` (the upgrade stamp); `site.url` reserved. Body = prose identity (the future MCP system prompt). Unknown top-level keys are named errors |
| `knowledge/example.md`                                    | one real governed document — never an empty directory                                                                                                                                                              |
| `system/site/`                                            | the reference shell: Next.js + Fumadocs + shadcn. next.config pins `turbopack.root`/`outputFileTracingRoot` to the repo root and sets `images.unoptimized`; a `basePath` knob is documented                        |
| `.agents/skills/`                                         | intake-interview · add-sources · format-checker; `.claude/skills/` = real copies, byte-identity checked by the format-checker; `.gemini/settings.json` points Gemini at AGENTS.md                                  |
| `.github/workflows/validate.yml`                          | adopter-owned CI running the format checks; SHA-pinned actions                                                                                                                                                     |
| `.gitattributes`                                          | `*.md text eol=lf` (instance.md included) — checkout bytes are provenance bytes                                                                                                                                    |
| `.gitignore`                                              | `.ksor/`, `node_modules/`, `system/site/.next/`, `system/site/out/`, `*.tsbuildinfo`, `.env*`, `.DS_Store`                                                                                                         |

**Record purity** (enforced by the scaffolded format-checker, later by
`ksor build`): `knowledge/` holds CommonMark `.md` and assets only — no
`.mdx`, no `meta.json`, no framework files; components are directives
(`:::quiz`) that degrade to readable text; the closed frontmatter set is
title, description, status, owner, provenance, effective, superseded,
superseded_by, order; filenames are Windows-safe with no case-insensitive or
`foo.md`/`foo/index.md` collisions and no parenthesized directories; asset
links never escape `knowledge/`. Identity: a doc's path is its route and its
future MCP URI — `ksor://<instance-name>/<path>`.

**The surface contract** (the shell is a slot — decision 9): the site renders
`knowledge/`, serves `llms.txt`, exposes per-page markdown (build artifacts
once `ksor build` exists; dev-mode rewrite as sugar), passes the browser
smoke, and contains no authored content. Any shell satisfying this contract
is valid; core ships exactly one.

## Acceptance

Red-first, on a clean machine: (1) run init twice with the same name into
temp dirs — trees are byte-identical and match the shipped templates
(diffed, never counted); (2) every refusal fires with its slug and correct
exit code; (3) the scaffolded project's own validate workflow logic passes
against the fresh scaffold; (4) `pnpm install && pnpm dev` serves the
example document — page renders in a real browser, both themes, zero
console errors, zero external requests; (5) editing `knowledge/example.md`
hot-reloads; (6) the agent eval: an agent given only the scaffolded project
completes the intake interview into `instance.md` and lands one governed
document that passes the format rules (CI-gated once the harness exists;
manual rubric until then).

## Out of scope

`build`/`serve` (own specs); the upgrade-diff mechanism (the
`ksor.scaffolded` stamp reserves its merge base); deploy recipes; binary
source storage (provenance = external location + content hash, recorded);
i18n; multi-corpus composition (second corpus = second project).
