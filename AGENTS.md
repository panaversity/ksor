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
agents. Write "KSoR" in prose, `ksor` for the package and CLI. It supersedes
the Python-era `vsor` SDK (see `research/handover-vsor-to-ksor.md`); settled
decisions and their reversal conditions live in `docs/decisions.md`.

## Repository layout

| Path                        | What it is                                                 |
| --------------------------- | ---------------------------------------------------------- |
| `packages/ksor/`            | the published package: CLI + SDK (MCP surface lands here)  |
| `packages/ksor/docs/`       | user docs, shipped inside the npm tarball                  |
| `tools/tsconfig/`           | shared strict tsconfig base — extend, don't fork           |
| `workbench/example-corpus/` | living KSoR fixture: dev target, test + eval surface       |
| `evals/`                    | agent evals (contract in its README; harness not yet live) |
| `docs/`                     | decisions.md (settled decisions) + status.md (what works)  |
| `research/`                 | issue-backed plans; frontmatter is guard-enforced          |
| `.agents/skills/`           | repo-maintenance skills (`.claude/skills` symlinks here)   |
| `scripts/`                  | guards, corpus checks, boundary tests — plain node/vitest  |

## Commands

```sh
pnpm install              # respects the packageManager pin (pnpm 11)
pnpm build                # tsdown via turbo (<10s)
pnpm typecheck            # tsc --noEmit per package (<5s)
pnpm lint                 # oxlint --fix (<1s)
pnpm fmt                  # oxfmt (<1s)
pnpm guard                # guard-invariants.mjs (<1s)
pnpm check:corpus         # frontmatter, links, instance identity (<1s)
pnpm test:unit            # *.test.ts, colocated, pure (<3s)
pnpm build && pnpm test:integration   # built artifacts + repo-tree suites (<15s)
```

Run fmt/lint/typecheck freely — they are cheap. Run unit tests after material
behavior changes. Treat local checks as advisory: CI is the source of truth —
don't burn cycles making advisory gates pass before handing off.

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
   an error, never a licence to fall back on model knowledge. Every eval suite
   asserts at least one abstention.
6. **Provenance is load-bearing — and provenance is not correctness.** Every
   build must record the exact corpus that produced it (`build.lock.json`,
   lands with `ksor build`); every answer must trace to a governed source.
   Never sell a who-said-when mechanism as a rightness one.
7. **Discoverability determines whether agents find you at all**: bundled docs,
   `llms.txt`, an MCP registry entry, a typed SDK.

## How we work

1. **Never write the present tense about behaviour that does not run.** If it
   is not built, say "will" — this is the rule that protects all the others.
2. **One fact, one file** — everywhere else is a pointer. (The predecessor once
   carried one fact in four files; two had diverged.)
3. **Cite `file:line` against pinned SHAs, or say you do not know.**
4. **Supersession is visible.** A reversed decision keeps its entry and gains a
   revision note; superseded documents live in git history, not the working
   tree.
5. **Decisions are recorded in the same change that acts on them** — in
   `docs/decisions.md`, with evidence and the condition that would reverse them.
6. **One obvious way.** A golden path is a compatibility guarantee for
   sampling agents.
7. **Never carry a mechanism across without asking what it was for.** (An
   inherited deployment tarball once taught two cold readers a false product.)
8. **Compose before you write.** Net-new code states why composition failed.
9. **Smallest change that proves the next assumption.**
10. **Every change names its business claim** — the product promise it serves —
    or it does not get built.

## Coding principles

1. **Code is liability.** Every net-new snippet earns its right to exist.
2. TypeScript strict, pure ESM, no `require()`. Never depend on the TypeScript
   compiler API — TS 7 has no stable one until 7.1 (guard rule 6).
3. Runtime dependencies need a recorded decision (guard rule 5). Wrap
   third-party libraries at a boundary module so they stay replaceable.
4. Pre-1.0: prefer breaking changes. Correctness and simplicity over backwards
   compatibility; no legacy fallback paths.
5. Comment why, not what. Default to no comment.
6. If a guard fails, fix the violation — never edit the baseline. Baselines
   only shrink.
7. Package boundaries are enrolled, never implied: every workspace package
   appears in `ALLOWED` in `scripts/boundaries.integration.test.ts`, declaring
   what it may import. Established at baseline zero because guards added late
   carry debt forever.
8. Public API boundaries accept Standard Schema validators; zod is an internal
   choice, not a contract.

## Testing

Two tiers by filename convention; pick the tightest tier that can express the
assertion.

- `src/**/*.test.ts` — unit: pure, no fs/subprocess/network (<3s total)
- `*.integration.test.ts` — built artifacts, subprocesses, repo-tree scans,
  tmp dirs (<15s)
- `evals/` — agent evals; contract in `evals/README.md`, harness lands with
  `ksor serve`

Before declaring implementation work done, load the $implement-spec skill —
red-first, live verification, the detail pass, and the truth sweep are its
territory. Hard-won rules from the predecessor's four shipped defects (each
found on a deployed artifact after green CI — post-mortems in
`research/handover-vsor-to-ksor.md`):

- **Assert on shipped bytes and computed values, not behavior alone.** A tier
  that copies the app directory inherits config the artifact won't have.
- **The test tier must install the same tree the artifact installs.** 65
  packages differed between fixture and shipped lockfile — including the
  compiler.
- **A failing assertion must print the value it actually saw.** The fix that
  finally worked came from a diagnostic printing the raw string.

## Documentation

Update docs in the same PR as the behavior change; run `pnpm check:corpus`
before handing off. `docs/status.md` is the only authority on implemented
functionality — never let the README outrun it. Any tree, count, or list
rendered into a doc must be generated from source with a drift test, or not
rendered at all (the predecessor's hand-maintained tree drifted four ways at
once).

## Governance

- Settled decisions live in `docs/decisions.md` with their evidence and the
  condition that would reverse each. **If your work contradicts a settled
  decision: stop and discuss with a human first.**
- Plans live in `research/` with `issue`, `status`, `last_updated` frontmatter
  (guard rule 4).
- Specs are for changes that alter a public surface, cross a package boundary,
  are expensive to reverse, or will be built unattended by an agent — one page:
  status, business claim, observable contract, acceptance, out-of-scope. Where
  spec and code disagree, the code wins and the spec is corrected in the same
  commit. `specs/` appears with the first spec, never before.
- The predecessor's Python packages are read-and-cite only until the copy
  grant is written (`docs/status.md` tracks this blocker). Do not move Python
  code across.

## Changesets

Every PR touching `packages/ksor` needs a changeset. Patch by default pre-1.0;
minor only for public-API breaks; docs-only and repo-tooling changes are
exempt. Write the body for release-notes readers.
Check: `pnpm changeset status --since=origin/main`.

## Skills

Baseline policy lives in this file; deep workflows live in skills and never
duplicate this file — they go deeper.

- $implement-spec — the implementation discipline: red-first, live
  verification, detail pass, truth sweep
- $authoring-skills — writing/maintaining SKILL.md files (frontmatter, triggers)
- $technical-writing — corpus and docs authoring; source-of-truth hierarchy
- $release — changesets deep workflow and publish path
- $find-skills — discover/install ecosystem skills (hash-pinned in skills-lock.json)

## Commit and PR style

Imperative, concise commit subjects. PRs describe problem → solution →
behavior for a reviewer, not a file list. Leave PRs in draft; a human marks
ready.

## Definition of done

Acceptance passes on a clean machine; any document the change made false was
corrected in the same commit; review findings were fixed or recorded, never
quietly dropped.

## Do not

- Do not weaken provenance, citation, abstention, or governance to make a test
  pass.
- Do not add runtime dependencies without a recorded decision (guard rule 5).
- Do not author `id:`/`name:` fields where the path is the identity.
- Do not edit guard baselines upward, or ALLOWED graphs without review.
- Do not commit `.only` or skipped tests.
- Do not move Python code from the predecessor until the copy grant is written.
- Do not create GitHub issues/comments or publish packages on your own
  initiative.
