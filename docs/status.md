# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-19.

## Published package

`@panaversity/ksor` **0.0.3** on npm (trusted publishing, provenance
attached — published by the release merging this page). It ships the
working `ksor init` described below — including the visibility model and
the deploy story — plus the CLI contract: `dev`,
`build` and `serve` still report "designed but not implemented" and exit
`2`; an unknown verb is refused with exit `1` and a stable
`error: unknown-verb` stderr slug. The package root exports `exitCodes`,
`verbs`, and `resolveCommand`, and docs ship inside the tarball under
`docs/`.

## Implemented (released in 0.0.3)

- **`ksor init`** — the first working verb, implemented red-first against
  the ratified spec (`specs/ksor/init/spec.md`). One command emits a
  complete governed project: the record (`knowledge/`), the Fumadocs
  reference site (`system/site/`, static export, hot reload, static
  search, llms.txt), the agent kit (`AGENTS.md`, `CLAUDE.md` pointer,
  `.agents/skills` + byte-identical `.claude/skills` copies, `.gemini`
  pointer), adopter CI (`validate.yml`, SHA-pinned), and a dependency-free
  format checker (`pnpm check`). Deterministic (every emitted byte ships
  as template content, lockfile included), atomic, offline, refusals with
  stable slugs and remedies. Acceptance runs on ubuntu and windows; a
  gated browser e2e drives the built site in real Chromium.

- **The shell swap seam, proven with two implementations** — a Docusaurus
  conformance shell at `workbench/shells/docusaurus/` (predecessor-based,
  decision 6) swaps into any scaffolded project by its README recipe, and
  one shell-agnostic suite runs the surface contract's five clauses, the
  `order:` translation, and the base-path build against both shells in CI.
  `ksor init` still emits Fumadocs, always — the second shell is the
  option and the vendor-neutrality proof, not a selector.

- **Visibility** (`specs/ksor/visibility/spec.md`, evidence in
  `research/visibility.md` and issue #10) — the record declares its
  audience: a `visibility:` key against an `audiences:` model in
  instance.md; per-audience **staged** builds on both shells carry no
  trace of a document below its tier (page, search, llms, sidebar, asset
  name or bytes — raw or base64); the filter itself never reaches the
  client bundle; non-public builds label themselves; seven checker rules
  including the cross-audience link no single build can catch. Absent
  `audiences:`, nothing changes. Conformance-tested with canary sweeps
  and positive controls in CI. Hardened by two adversarial review rounds
  (16 findings fixed): one canonical frontmatter grammar across the
  checker and both shells, and every malformed shape fails closed —
  including the two that once failed open (a block-list `visibility:`,
  a `----`-closed frontmatter block).

- **The deploy story** — the scaffold ships `vercel.json` answering
  Vercel's setup interview (repo root, static export), and the scaffolded
  README/AGENTS.md document deploying to any static host, including the
  rule that a `KSOR_AUDIENCE` build belongs behind that audience's own
  access control, never on a public host.

- **Base environment**: pnpm 11 workspace with catalog pins, TypeScript 7
  (native compiler), pure-ESM package build via tsdown, vitest unit +
  integration tiers, oxlint + oxfmt, changesets with npm
  trusted publishing, CI with SHA-pinned actions.
- **Governance machinery**: AGENTS.md constitution (CLAUDE.md symlinks to it)
  carrying the decision record, guard invariants (`pnpm guard`), corpus integrity checks (`pnpm check:corpus`),
  package-boundary tests at baseline zero, and five repo-maintenance skills
  under `.agents/skills/` (`implement-spec`, `release`, plus vendored `find-skills`,
  `skill-creator`, `mcp-builder` — the vendored three hash-pinned in
  `skills-lock.json`).
- **Fixture**: `workbench/example-corpus/` — a tiny governed corpus exercising
  the same rules adopters will live under.

## In this repository, not yet released

- **The content kernel and the MCP gateway** (decision 11, in progress on
  the kernel-conversion branch): four workspace packages — platform (pool
  discipline), content (schema + ingest + hybrid retrieval
  - calibrated abstention + read plane), gateway-kit (fail-closed serving
    postures), content-gateway (the content MCP door: search/outline/read over stateless
    Streamable HTTP — one transport, loopback by default). Ships as ONE npm
    package (decision 12, publish revision): `content-gateway` bundles the
    other three and exposes both bins (`ksor-content` corpus setup +
    `ksor-content-gateway` serve); the three stay `private` (dev/test).
    Converted from the production oracle with
    its suite as the fixture source; acceptance drives the BUILT binary
    with a real MCP client against live Postgres (Neon, pgvector) — cited
    passages, snapshot generation-pinning, byte-exact reads, and the typed
    abstention. Takedown denial is scoped (decision 14): per-node by default,
    whole-subtree by explicit opt-in via a serving-time `parent_id` walk —
    one seam (`lib/takedown.ts`) across search, read, outline, and calibration,
    proved in `takedown.db.test.ts`. The published `ksor` CLI is untouched:
    `serve` still exits `2` until the npm packaging question (decision 12) is
    resolved.

## Known gaps in the kernel conversion (tracked, not blocking)

- **MCP protocol version**: the gateway is on `@modelcontextprotocol/sdk`
  1.30.0 (the latest), which implements spec revision **2025-11-25**. The
  current spec is **2026-07-28** (handshake-free, `server/discover`,
  per-request version headers) — the SDK does not implement it yet, so the
  gap is upstream, not in this repo. Stateless Streamable HTTP is the shape
  that migrates with the least surgery; it is a one-dependency bump when the
  SDK catches up.
- **No schema migration runner**: `schema.sql` is one file, versioned in
  `schema_meta` (2.1). That is correct while no adopter has production data
  (nothing is released). Before adopters do, a forward-migration path
  (versioned plain SQL + a runner keyed on `schema_meta`) is owed —
  recorded as a decision in `research/kernel-conversion.md`.

## Designed, not implemented

- `ksor dev` / `build` — the CLI verbs still exit `2` with an honest notice;
  the scaffold's own `pnpm dev` / `pnpm build` work today without them.
  `ksor serve` IS implemented: the zero-dep CLI resolves and spawns the
  installed kernel gateway bin (`@panaversity/ksor-content-gateway`),
  forwarding args/env/stdio; it exits `3` with a remedy when the kernel is
  not installed. Wired but not yet released (the kernel package is
  `private` pending the publish flip + npm bootstrap).
- Build provenance records (`build.lock.json`) — designed with `ksor build`.
- Governed directives (`:::quiz` etc.) — no grammar ratified yet; shells
  pass them through as readable text (spec, deferred 2026-08-18).
- The agent-eval harness (contract in AGENTS.md → Testing); until it
  exists, acceptance (6) runs as a manual rubric-scored walk.
- Doc code-sample checking (`check-snippets`) — deferred until the docs carry
  import fences worth verifying.

Primitives design for the verbs: `research/primitives-proposal.md`.

## Predecessor (vsor)

The Python-era SDK at
[panaversity/zia-vsor-sdk](https://github.com/panaversity/zia-vsor-sdk)
ships a working product (`vsor` 0.1.4 on PyPI, live demo at
vsor-demo.vercel.app). **It is a source to mine, not an authority to
follow**: the owner granted taking its work — Python included — and
converting it to TypeScript (AGENTS.md decision 6, 2026-08-18, retiring the
handover's copy-grant blocker). Conversion is engineering-gated: nothing
crosses without asking what it was for, and converted code lands with its own
tests. Its failure record lives in `research/handover-vsor-to-ksor.md`.

## Pending owner actions

- Add **`GEMINI_API_KEY`** as a repository Actions secret — the kernel
  conversion's gated live tiers (retrieval + calibration evals) embed for
  real (decision 11); until the secret exists those tiers skip.
- Flip the org setting **"Allow GitHub Actions to create and approve pull
  requests"** — until then every release's Version-PR needs the manual
  rescue documented in the `$release` skill. (The npm Trusted Publisher is
  configured — 0.0.1 published through it.)
- Decide the version signal for the init release: the changeset is `patch`
  (0.0.2) per the constitution's pre-1.0 rule; flip to `minor` (0.1.0) if
  the milestone should read in the version.
- Repoint the **`vsor` PyPI Trusted Publisher** — it still names
  `panaversity/zia-vertical-system-of-record`, which no longer resolves; a
  release tag today passes every gate and fails at upload.
- Tell the **sor-agentfactory** maintainers the destination changed: five PRs
  making `sor-content` embedding-provider-agnostic now serve upstream hygiene,
  not the crossing — and PR 2's blast radius includes the nightly
  eval-before-flip gate.
