---
issue: recorded via the base-environment PR (link updated on PR creation)
status: accepted
last_updated: 2026-08-18
---

# ksor base environment — the plan

Plan for the base environment of ksor: the AGENTS.md constitution, the agent-skills
roster, and the TypeScript toolchain. Derived from studying fresh clones of
vercel/eve, vercel/workflow, vercel/ai, and vercel/next.js (2026-08-17), plus a
toolchain-currency pass verified against npm/official sources the same day, plus a
skills-ecosystem scan via `npx skills find`.

The one-sentence thesis: **ksor's repo must be the first KSoR** — the same
guarantees the product makes about governed knowledge (one source, two surfaces,
provenance, machine-checked validity, honest abstention) applied to its own
development environment.

---

## 1. What the study found (convergent across all four repos)

Every Vercel framework repo, independent of age, has converged on the same five
primitives:

1. **AGENTS.md is the single canonical agent contract.** CLAUDE.md is a symlink to
   it (next.js, workflow, ai) or a one-line `@AGENTS.md` import (eve). Zero drift by
   construction, not discipline.\
2. **Skills are two-tier.** `.agents/skills/` (or root `skills/` marked
   `metadata.internal`) holds repo-maintenance workflows for agents working _on_ the
   repo; a public tier ships product skills to downstream users via
   `npx skills add`. SKILL.md frontmatter: `name` + trigger-rich `description`
   (+ `metadata.version`, bumped on every edit — workflow's rule).
3. **Docs ship inside the npm package** (prepack copy), and the public skill's main
   job is a redirect: "your training memory is stale — read
   `node_modules/<pkg>/docs`, it matches the installed version." All four repos do
   this. For ksor this is not a convention, it is the product thesis.
4. **Conventions are machine-enforced, with why-bearing errors.** eve's
   `guard-invariants.mjs` (numbered rules, every error explains why + how to fix,
   shrink-only baseline), ai's konsistent + custom lint rules, everyone's
   docs-integrity CI (frontmatter schema, nav reachability, snippet imports resolve
   against the real exports map, code samples compile).
5. **Agent evals are first-class tests.** next.js `evals/` measures whether an agent
   succeeds with vs without the bundled docs ("baseline staying red while agents-md
   flips green tells you the doc did it"). eve's e2e _is_ an eval suite. workflow's
   migration skill carries its own acceptance rubric.

What they explicitly regret or outgrew (encode as anti-patterns): next.js cannot
retrofit `strict: true`; bespoke build pipelines (taskr/SWC, eve's hand-rolled
rolldown scripts) exist for reasons ksor doesn't have; dual-branch release models,
OS/bundler test matrices, api-extractor compat ratchets, and custom convention
engines are all scale machinery to defer.

## 2. The decision ledger (exact pins, verified 2026-08-17)

| Primitive       | Decision                                      | Pin                                                                                                                                                                        | Why / precedent                                                                                                                                                                                                           |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript, native compiler                   | `typescript` **7.0.2** via `catalog:`                                                                                                                                      | GA July 2026, 8–12x builds. Caveat: no stable compiler API until 7.1 — ksor must never depend on the TS programmatic API (it doesn't need to). eve pins the same.                                                         |
| Runtime         | Node                                          | `engines: >=24`, `.nvmrc` = 24                                                                                                                                             | Node 24 is the sole Active LTS; 26 joins LTS 2026-10-28 and is covered by `>=24`. eve identical.                                                                                                                          |
| Package manager | pnpm                                          | `packageManager: pnpm@11.22.0` (exact)                                                                                                                                     | pnpm 12 still RC. Exact pin required (Corepack rejects ranges); keep classic `packageManager` field.                                                                                                                      |
| Workspace       | pnpm workspaces + catalog                     | `catalog:` for typescript, vitest, zod                                                                                                                                     | One place agents look for versions; syncpack only if catalogs stop being enough.                                                                                                                                          |
| Supply chain    | pnpm quarantine                               | `minimumReleaseAge: 2880`, `savePrefix: ""`, `onlyBuiltDependencies` allowlist w/ why-comments (empty until first need)                                                    | 48h cooldown on new releases; workflow/next.js/eve all do this. Cheap, on-thesis hardening.                                                                                                                               |
| Module system   | Pure ESM                                      | `type: module`, NodeNext, explicit exports maps `{types, import, default}`                                                                                                 | AI SDK v7 dropped CJS entirely; no dual publishing. `sideEffects: false`, `files` allowlist.                                                                                                                              |
| Strictness      | eve's flag set, day one                       | strict, ES2024, verbatimModuleSyntax (implies isolatedModules), erasableSyntaxOnly, noUncheckedIndexedAccess, noImplicitOverride, noUnused* , noUncheckedSideEffectImports | next.js proves you can never turn strict on later. Shared base in `tools/tsconfig` (workflow/ai pattern).                                                                                                                 |
| Build           | tsdown                                        | `tsdown` ^0.22 (→ ^0.23 at stable)                                                                                                                                         | Rolldown/Oxc-based; tsup is in maintenance and points at it; the MCP SDK itself migrated. Requires Node ≥24 — consistent.                                                                                                 |
| Test            | Vitest, filename-convention tiers             | `vitest` ^4.1 (v5 RC out; cheap bump later)                                                                                                                                | `*.test.ts` unit (<3s) and `*.integration.test.ts` (<15s incl. build) only; "pick the tightest tier that can express the assertion" (eve). Unaffected by the TS7 API gap.                                                 |
| Lint/format     | oxlint + oxfmt                                | oxlint ^1.78, oxfmt ^0.63, ~4-line configs                                                                                                                                 | eve's exact stack; Oxc-aligned with tsdown; typescript-eslint is blocked on the TS7 API anyway. Pre-commit hook formats staged files. Biome 2.5 is the acceptable fallback if one-tool is preferred.                      |
| Task runner     | Minimal turbo.json                            | `turbo` ^2.9, cache only `build`, tests uncached                                                                                                                           | Stable agent-facing task vocabulary (`pnpm build/test/typecheck` everywhere); full tuning deferred.                                                                                                                       |
| Release         | Changesets + trusted publishing               | `@changesets/cli`, patch-default pre-1.0, `id-token: write`, publint in CI                                                                                                 | eve's policy verbatim: every PR touching the published package needs one; minor = public-API break; body written for release-notes readers. Single branch — no beta/stable dual channel.                                  |
| Validation      | zod internally, Standard Schema at boundaries | `zod` ^4.4, `@standard-schema/spec` ^1.1                                                                                                                                   | Public API typed against `StandardSchemaV1` so users bring any compliant validator.                                                                                                                                       |
| MCP             | SDK v2, stateless spec                        | `@modelcontextprotocol/server` ^2.0.0 (spec **2026-07-28**)                                                                                                                | stdio for `ksor serve --stdio`; stateless Streamable HTTP for remote; never the deprecated HTTP+SSE transport. Emit `server.json`; serve `/.well-known/mcp/server.json` from the built site; publish to the MCP registry. |
| Human surface   | Docusaurus                                    | `@docusaurus/core` 3.10.2 + `@docusaurus/faster`, `future: { v4: true }`                                                                                                   | Rspack builds stable in 3.10; v4-ready from day one. Unaffected by TS7 API gap.                                                                                                                                           |
| CI              | GitHub Actions, hygiene from eve              | actions pinned to commit SHAs, `persist-credentials: false`, `node-version-file: .nvmrc`, one bundled lint/guards job                                                      | Small job list: lint+guards, typecheck, test-unit, test-integration, build+publint, release.                                                                                                                              |

## 3. Repository layout (target)

```text
ksor/
├── AGENTS.md                  # the constitution — single agent contract
├── CLAUDE.md                  # symlink -> AGENTS.md
├── packages/
│   └── ksor/                  # @panaversity/ksor — CLI + SDK + MCP surface + init templates
│       ├── src/
│       ├── docs/              # user docs, shipped in the npm tarball (files: [..., "docs"])
│       └── templates/         # what `ksor init` scaffolds (incl. generated AGENTS.md + skills)
├── tools/
│   └── tsconfig/              # shared strict base, extended by every package
├── workbench/
│   └── example-corpus/        # a living KSoR: dev target + e2e surface + eval fixture
├── evals/                     # agent evals: PROMPT.md + EVAL.ts, baseline vs with-MCP
├── docs/                      # ksor's own website corpus — itself a KSoR (dogfood)
├── research/                  # issue-backed plans, frontmatter CI-enforced (this file is #1)
├── decisions/                 # ADRs written as executable specs for agents (ai pattern)
├── .agents/skills/            # repo-maintenance skills (.claude/skills symlinks here — already true)
├── skills/                    # published product skills: ksor, ksor-init
└── scripts/                   # guard-invariants.mjs, check-corpus.mjs, install-git-hooks.mjs
```

Migration note: today's root `package.json` _is_ the published package (`bin/ksor.js`,
`files: [bin]`). Root becomes a private workspace; the published package moves to
`packages/ksor/` keeping the name `@panaversity/ksor` and bin `ksor`.

## 4. AGENTS.md — the constitution

Shape (synthesized: workflow's critical-rules-first, eve's rule+rationale style and
~230-line size target, ai's tables/Do-Not list, next.js's $skill index):

1. **Critical rules first, max three** — (a) never weaken provenance, citation,
   abstention, or governance guarantees to simplify an implementation — they are the
   product; (b) never push to main; (c) never break the agent-discoverable surfaces
   (bundled docs, llms.txt, `/.well-known/mcp/server.json`).
2. **Every rule carries a one-clause rationale.** Rule + why, never bare decree (eve).
3. **Commands as one copy-paste block with annotated runtimes** (`unit tests (<3s)`).
4. **Product principles and coding principles are separate numbered lists.**
5. **Skills index**: AGENTS.md keeps one-liner guardrails and links `$skill-name` for
   deep workflows; skills never duplicate AGENTS.md, they go deeper (next.js
   contract, stated verbatim in their skills README).
6. **Audience scoping**: sections only relevant to corpus authors (vs framework
   contributors) labeled as such (workflow pattern).
7. **Closing "Do not" list** of hard prohibitions (ai pattern).
8. **"Local checks are advisory; CI is the source of truth"** so agents don't spin
   on gates before handoff (workflow wording).

Full draft text: see the companion artifact / PR that materializes this plan.
ksor-specific articles the draft must contain beyond the borrowed skeleton:

- **Identity derives from file path.** A doc's path is its ID, its site route, and
  its MCP resource URI; no authored `id:`/`name:` fields anywhere (eve's guard rule,
  perfect fit for a corpus).
- **Every corpus-lint error must teach the fix.** Errors are documentation; an agent
  (or SME) must be able to self-correct without a reviewer.
- **Abstention is tested.** Every eval suite includes at least one out-of-corpus
  question whose only correct answer is the refusal string.
- **Contradicting an accepted ADR = stop and ask the human** (ai's governance rule).
- **Changesets**: patch by default pre-1.0; minor only for public-API breaks;
  docs-only changes exempt; body written for release-notes readers.

## 5. Agent skills roster

**Tier 1 — repo maintenance (`.agents/skills/`, day one):**

| Skill               | Purpose                                                                                                                                                     | Origin                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `find-skills`       | already installed, hash-pinned in skills-lock.json                                                                                                          | vercel-labs/skills (keep)    |
| `authoring-skills`  | meta-skill: SKILL.md frontmatter contract, what belongs in a skill vs AGENTS.md, description-as-trigger examples                                            | write ours (next.js pattern) |
| `technical-writing` | corpus/docs authoring with explicit source-of-truth hierarchy ("do not rely on training data: 1. source/types/tests, 2. CLI help, 3. docs, 4. merged PRs…") | write ours (eve pattern)     |
| `release`           | changesets deep workflow: the status one-liner, pre-1.0 semantics, publish path                                                                             | write ours                   |

**Tier 2 — product skills (`skills/` at root, published, `npx skills add panaversity/ksor`):**

| Skill       | Purpose                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ksor`      | the redirect skill: "do not trust training memory — read `node_modules/@panaversity/ksor/docs`, it matches the installed version" |
| `ksor-init` | pre-install scaffold: sanity-check the project, then follow exactly one official getting-started doc (workflow-init pattern)      |

**Tier 3 — skills `ksor init` emits into every scaffolded KSoR** (templates in
`packages/ksor/templates/`; this is the README's "agent-first development" promise
made concrete — ksor _generates_ constitutions and skills):

| Skill              | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `add-knowledge`    | author a governed doc: placement, frontmatter, provenance fields               |
| `import-source`    | convert source material (PDF/deck/wiki) into governed markdown with provenance |
| `check-provenance` | audit citations + provenance chain across the corpus                           |
| `validate-corpus`  | run ksor validation and interpret failures                                     |
| `release-corpus`   | build (records build.lock.json), verify, deploy both surfaces                  |

**External installs** (scanned via `npx skills find` per the find-skills protocol):
the ecosystem has no strong skill for Docusaurus (best: 66 installs), corpus
governance, or changesets (best: ~150) — those are ksor's to author, and Tier 3 is
itself a publishable product. Worth considering, hash-pinned via skills-lock.json:
`github/awesome-copilot@create-agentsmd` (12.3K installs, one-time aid),
`anthropics/skills@skill-creator` (354K, overlaps `authoring-skills`),
`github/awesome-copilot@typescript-mcp-server-generator` (11.9K — reference only;
ksor builds on MCP SDK v2, most generators still target v1). Default stance: install
few, author our own — skills are product surface for ksor, not tooling.

## 6. Corpus integrity is the test suite

Adapted from eve's three docs-check scripts + next.js evals — for ksor these are not
docs hygiene, they are the product's acceptance tests:

- `check-corpus.mjs` — frontmatter schema per doc type; every page reachable from
  nav; no orphan or dead internal links; provenance fields present where governance
  requires them.
- `check-snippets.mjs` — every `from "@panaversity/ksor/…"` import in docs/corpus
  code fences resolves against the real exports map; samples compile in CI
  (workflow's docs-typecheck pattern).
- `guard-invariants.mjs` — numbered mechanical invariants (CLAUDE.md is a pointer;
  identity-from-path; no authored ids; research/ frontmatter), why-bearing error
  messages, shrink-only baseline.
- `evals/` — fixture corpus + PROMPT.md + EVAL.ts, two variants per eval: baseline
  (no MCP surface) vs with-MCP. Assert: correct answer **with citation** to the
  governing doc, and **abstention** on out-of-corpus questions. Green-vs-red between
  variants proves the agent surface earns its keep.

## 7. Bootstrap order

1. Root becomes private workspace: `packageManager: pnpm@11.22.0`, `.nvmrc` 24,
   `engines >=24`; `pnpm-workspace.yaml` with catalog (typescript 7.0.2, vitest,
   zod), `minimumReleaseAge: 2880`, `savePrefix: ""`.
2. `tools/tsconfig` shared strict base; `packages/ksor` skeleton (type: module,
   exports map, bin, tsdown, publint).
3. oxlint + oxfmt 4-line configs + `prepare`-installed pre-commit format hook.
4. Vitest unit + integration configs (filename tiers).
5. AGENTS.md (the constitution) + `CLAUDE.md -> AGENTS.md` symlink.
6. `scripts/guard-invariants.mjs` with rules 1–3 + `check-corpus.mjs` skeleton,
   wired into one CI lint job. `ci.yml` (lint/guards, typecheck, test x2, build +
   publint) with SHA-pinned actions.
7. Changesets init + `release.yml` (npm trusted publishing, queue-not-cancel).
8. `workbench/example-corpus` + first eval (one in-corpus question w/ citation, one
   abstention case).
9. Tier-1 skills (`authoring-skills`, `technical-writing`, `release`); Tier-2/3 as
   the CLI verbs materialize.

## 8. Deliberately deferred (anti-baggage list)

OS/bundler test matrices and Windows CI; dual-branch (beta/stable) release model and
backport automation; api-extractor compat ratchets; custom convention engines
(konsistent-style) and custom lint plugins — guard script first, engine when a rule
is violated twice; bundle-size/docker budgets; DCO + signed-commit enforcement;
issue-triage automation; turbo remote-cache tuning; TS project references;
scenario/TUI test tiers until a real subprocess surface exists.
