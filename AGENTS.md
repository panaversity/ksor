# AGENTS.md

> CLAUDE.md is a symlink to this file. They are the same file: one contract for
> every agent — human-readable and agent-readable, like everything else here.

## Critical rules

1. **Never weaken provenance, citation, abstention, or governance guarantees to
   simplify an implementation.** They are the product, not features of it.
2. **Never push directly to `main`.** Every change lands through a pull request.
3. **Never break the agent-discoverable surfaces**: docs bundled in the npm
   package (`packages/ksor/docs/`), and — once the site ships — its `llms.txt`
   and `/.well-known/mcp/server.json`. Agents finding ksor is how ksor gets used.

## What this is

ksor (`@panaversity/ksor`, CLI `ksor`) turns one governed markdown corpus into
two synchronized surfaces: a static site for humans and an MCP surface for AI
agents. Write "KSoR" in prose, `ksor` for the package and CLI.

A Python-era predecessor (vsor) exists. It is **reference material, not
authority**: read it for ideas and for the record of what failed
(`research/handover-vsor-to-ksor.md`), then decide independently. Nothing is
adopted here because the predecessor did it; nothing inherited is exempt from
being rethought.

## Repository layout

| Path                        | What it is                                                |
| --------------------------- | --------------------------------------------------------- |
| `packages/ksor/`            | the published package: CLI + SDK (MCP surface lands here) |
| `packages/ksor/docs/`       | user docs, shipped inside the npm tarball                 |
| `workbench/example-corpus/` | living KSoR fixture: dev target, test + eval surface      |
| `docs/status.md`            | the only authority on what is implemented (npm links it)  |
| `research/`                 | plans and records; frontmatter is guard-enforced          |
| `.agents/skills/`           | repo-maintenance skills (`.claude/skills` symlinks here)  |
| `scripts/`                  | guards, corpus checks, boundary tests — plain node/vitest |
| `tsconfig.base.json`        | the shared strict base — extend, don't fork               |

## Commands

```sh
pnpm install              # respects the packageManager pin (pnpm 11)
pnpm build                # tsdown via turbo (<10s)
pnpm typecheck            # tsc --noEmit, packages + scripts (<5s)
pnpm lint                 # oxlint --fix (<1s)
pnpm fmt                  # oxfmt (<1s)
pnpm guard                # guard-invariants.mjs (<1s)
pnpm check:corpus         # frontmatter, links, instance identity (<1s)
pnpm test:unit            # *.test.ts, colocated, pure (<3s)
pnpm build && pnpm test:integration   # built artifacts + repo-tree suites (<15s)
```

Run fmt/lint/typecheck freely — they are cheap. Treat local checks as advisory:
CI is the source of truth — don't burn cycles making advisory gates pass before
handing off.

## Decisions

Recorded here, in the same change that acts on them; each names what would
reverse it. **Work that contradicts one stops and goes back to a human.**

1. **TypeScript and npm are the front door.** The site toolchain must execute
   on the adopter's machine, so Node is a prerequisite no other runtime can
   hide; a second mandatory runtime buys the adopter nothing. Reversed if the
   end user ever stops needing a local Node build.
2. **Package `@panaversity/ksor`, command `ksor`.** Unscoped `ksor` is blocked
   by npm's publish-time similarity gate (verified by a real `E403`; a registry
   404 is not evidence of publishability). Not reversible.
3. **Apache-2.0, whole repository.**
4. **Corpus scaffolds are copy-into-repo** (the shadcn model, validated by our
   own study of its mechanics): the adopter owns what `ksor init` emits;
   updates are offered as diffs and applied only by explicit overwrite.
   Reversed per-file if a scaffold file must stay framework-owned to preserve
   a product guarantee.
5. **Toolchain** per the `research/base-environment.md` §2 ledger: TS 7 native
   (never depend on its compiler API before 7.1 — guard rule 6), Node ≥24,
   pnpm exact-pinned, pure ESM, tsdown, vitest tiers, oxlint+oxfmt, changesets
   with npm trusted publishing. Reversed per-pin when a recorded caveat fires.

**Open questions — deliberately not settled, decide independently when the
work arrives:** how retrieval and abstention are implemented for `serve`
(reimplement in TS is the default posture; the predecessor's Python kernel is
reference only), and the site shell (Docusaurus vs Fumadocs — evidence in
`research/primitives-proposal.md` §4, decide before the site slice). PyPI
`ksor` is left unclaimed on purpose; revisit only if the exposure changes.

## Product principles

1. **Docs are priority #1.** Agents read the docs before they ever run the
   product; for a knowledge system of record, the docs are the product twice
   over.
2. **One source, two surfaces.** The site and the MCP surface must render the
   same corpus build — never let them read different truths.
3. **Identity derives from file path.** A doc's path is its ID, its site route,
   and its MCP resource URI. No authored `id:`/`name:` fields — the corpus
   check rejects them.
4. **Errors are documentation.** Every failure states what is wrong, why the
   rule exists, and how to fix it. The CLI's exit codes are a contract
   (1 refused, 2 not implemented, 3 environment), and when refusals gain
   detail, the first stderr line is a stable machine-readable slug.
5. **Abstention is a feature.** "Not in this corpus" is a correct answer, never
   an error, never a licence to fall back on model knowledge.
6. **Provenance is load-bearing — and provenance is not correctness.** Every
   build must record the exact corpus that produced it (`build.lock.json`,
   lands with `ksor build`); every answer must trace to a governed source.
   Never sell a who-said-when mechanism as a rightness one.
7. **Discoverability determines whether agents find you at all**: bundled docs,
   `llms.txt`, an MCP registry entry, a typed SDK.

## How we work

1. **Test-driven, red first.** Acceptance and tests are written before the
   implementation and watched failing for the right reason; the
   implementation's job is to turn exactly those red lights green. Load
   $implement-spec before writing the first line. An aspect with no test
   planned is a hole in the plan, not a TODO.
2. **Small, composable units.** One responsibility per module; behavior lives
   in small pure functions composed upward; the CLI stays a thin caller of
   library functions (the boundary suite enforces that nothing imports it).
   Prefer composing what exists — net-new code states why composition failed.
3. **Never write the present tense about behaviour that does not run.** If it
   is not built, say "will".
4. **One fact, one file** — everywhere else is a pointer.
5. **Cite `file:line` against pinned SHAs, or say you do not know.**
6. **Supersession is visible.** A reversed decision keeps its entry and gains a
   revision note; superseded documents live in git history, not the working
   tree.
7. **Smallest change that proves the next assumption.**
8. **One obvious way.** A golden path is a compatibility guarantee for
   sampling agents.
9. **Never carry a mechanism across without asking what it was for** — from
   the predecessor or anywhere else.

## Coding principles

1. **Code is liability — and so is context.** Every net-new snippet, file, and
   skill earns its right to exist; cut what stops earning it.
2. TypeScript strict, pure ESM, no `require()`, no `any`. Types derive from
   values (schemas, `as const`, inference) rather than being declared beside
   them. Never depend on the TypeScript compiler API — TS 7 has no stable one
   until 7.1 (guard rule 6).
3. Runtime dependencies need a recorded decision (guard rule 5). Wrap
   third-party libraries at a boundary module so they stay replaceable.
4. Pre-1.0: prefer breaking changes. Correctness and simplicity over backwards
   compatibility; no legacy fallback paths.
5. Comment why, not what. Default to no comment.
6. If a guard fails, fix the violation — never edit the baseline. Baselines
   only shrink.
7. Package boundaries are enrolled, never implied: every workspace package
   appears in `ALLOWED` in `scripts/boundaries.integration.test.ts`, declaring
   what it may import.

## Testing

Two tiers by filename convention; pick the tightest tier that can express the
assertion.

- `src/**/*.test.ts` — unit: pure, no fs/subprocess/network (<3s total)
- `*.integration.test.ts` — built artifacts, subprocesses, repo-tree scans,
  tmp dirs (<15s)
- Agent evals land with `ksor serve`: fixture corpus + prompt + assertions,
  run baseline vs with-MCP; pass = the correct answer **with a citation**, and
  every suite includes an out-of-corpus question whose only passing answer is
  the abstention. CI-only — they spend model tokens.

Three rules paid for with shipped defects (post-mortems in
`research/handover-vsor-to-ksor.md`):

- **Assert on shipped bytes and computed values, not behavior alone.**
- **The test tier must install the same tree the artifact installs.**
- **A failing assertion must print the value it actually saw.**

## Documentation

Update docs in the same PR as the behavior change; run `pnpm check:corpus`
before handing off. `docs/status.md` is the only authority on implemented
functionality — never let the README outrun it.

Do not rely on training data for claims about ksor. In order: 1 source, types,
and tests · 2 real CLI output · 3 existing docs · 4 merged PRs and the
changelog. `research/` plans are intent, not behavior — cite as "planned".
For third-party systems, fetch current official docs; don't recall them.
Corpus documents name their sources precisely and copy load-bearing values
exactly; superseded documents are marked, never deleted. Any tree, count, or
list rendered into a doc is generated from source with a drift test, or not
rendered at all.

## Changesets and releases

Every PR touching `packages/ksor` needs a changeset. Patch by default pre-1.0;
minor only for public-API breaks; docs-only and repo-tooling changes are
exempt. Write the body for release-notes readers.
Check: `pnpm changeset status --since=origin/main`.

Releases publish only from CI (`release.yml`: changesets action + npm trusted
publishing, full gate runs in the same job). Never run `changeset publish` or
`npm publish` locally; never cancel a running release — the concurrency group
queues.

## Skills

Baseline policy lives in this file; deep workflows live in skills and never
duplicate this file — they go deeper.

- $implement-spec — the implementation discipline: red-first, live
  verification, detail pass, truth sweep
- $find-skills — discover/install ecosystem skills (hash-pinned in skills-lock.json)

The contract for authoring one: frontmatter `name` equals the directory name
(guard rule 3), the `description` is the trigger — name the tasks and phrases,
bump `metadata.version` on every edit, and a new skill must beat its absence
in a with/without comparison recorded in the PR — a skill nobody can show
winning is deleted. Vendored skills (hash-pinned in `skills-lock.json`) keep
their upstream frontmatter untouched.

## Commit and PR style

Imperative, concise commit subjects. PRs describe problem → solution →
behavior for a reviewer, not a file list. Leave PRs in draft; a human marks
ready.

## Definition of done

Red tests written first are green; acceptance passes on a clean machine; any
document the change made false was corrected in the same commit; review
findings were fixed or recorded, never quietly dropped.

## Do not

- Do not weaken provenance, citation, abstention, or governance to make a test
  pass.
- Do not add runtime dependencies without a recorded decision (guard rule 5).
- Do not author `id:`/`name:` fields where the path is the identity.
- Do not edit guard baselines upward, or ALLOWED graphs without review.
- Do not commit `.only` or skipped tests.
- Do not port predecessor code — TypeScript or Python — without an independent
  case for it; ideas cross freely, code must re-earn its place.
- Do not create GitHub issues/comments or publish packages on your own
  initiative.
