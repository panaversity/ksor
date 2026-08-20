# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-20.

## Published package

`@panaversity/ksor` **0.0.3** on npm (trusted publishing, provenance
attached). **In the currently published 0.0.3** it ships the working
`ksor init` described below — including the visibility model and the deploy
story — plus the CLI contract where `dev`, `build` AND `serve` still report
"designed but not implemented" and exit `2`; an unknown verb is refused with
exit `1` and a stable `error: unknown-verb` stderr slug. The package root
exports `exitCodes`, `verbs`, and `resolveCommand`, and docs ship inside the
tarball under `docs/`. (The kernel fold-in below makes `serve`/`ingest`/`schema`/
`calibrate`/`gc` real — that lands in the NEXT release, 0.0.4, not 0.0.3.)

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
    Streamable HTTP — one transport, loopback by default). BUNDLED into
    `@panaversity/ksor` (decision 12, publish revision 2026-08-20): the CLI
    inlines all four and exposes ONE `ksor` binary with every verb —
    `init`/`dev`/`build`, `serve` (the MCP server, in-process), and
    `ingest`/`schema`/`calibrate`/`gc`; the four kernel packages stay
    `private` (dev/test), never published. The CLI is no longer zero-dep.
    Converted from the production oracle with
    its suite as the fixture source; acceptance drives the BUILT binary
    with a real MCP client against live Postgres (Neon, pgvector) — cited
    passages, snapshot generation-pinning, byte-exact reads, and the typed
    abstention. Takedown denial is scoped (decision 14): per-node by default,
    whole-subtree by explicit opt-in via a serving-time `parent_id` walk —
    one seam (`lib/takedown.ts`) across search, read, outline, and calibration,
    proved in `takedown.db.test.ts`. The npm packaging question (decision 12)
    is resolved 2026-08-20: the kernel is bundled into `@panaversity/ksor` and
    `ksor serve` runs the MCP server in-process (see "Designed, not
    implemented" for the exact per-verb state). Because MCP serving is a core
    surface (decision 11 revision 2026-08-20), `ksor init` now declares
    `@panaversity/ksor` as a scaffold dependency pinned to the exact CLI
    version, with `pnpm serve` / `pnpm ingest` scripts — so the served tool is
    first-class in every new project. Not yet released.

## Known gaps in the kernel conversion (tracked, not blocking)

- **Serve-rung ergonomics, deferred to a fast-follow** (surfaced by a
  four-agent operability review, 2026-08-20; the blockers it found — the
  format-checker rejecting kernel `instance.md` keys, the release-CI
  self-reference, the missing `--flip`, the undocumented setup path — are
  FIXED here, as are a second round's: the tarball now asserts the bundled
  `schema/schema.sql` ships and renders DDL from the PACKED layout, the corpus
  verbs have binary-level dispatch coverage, the withdrawn-generation snapshot
  refresh has a db test with a positive control, and one gated live Gemini call
  proves the real embedding space). Still owed, each additive and
  independently specced: a
  first-class **`ksor grant`** verb (today the ingest authorization is a
  documented manual `INSERT`); a dedicated **`serve-setup` skill** in the
  scaffold agent kit (today the runbook lives in the scaffold `AGENTS.md`);
  and a **serve deploy recipe** (Dockerfile / managed-Postgres guide — today
  serve runs anywhere Node runs, with the env contract and fail-closed posture
  documented, but no packaged deploy).
- **MCP protocol version — DONE: the surface ships on the current revision.**
  The gateway serves the **2026-07-28** spec revision via SDK **v2**
  (`@modelcontextprotocol/server` 2.0.0; `@modelcontextprotocol/client` 2.0.0
  drives the acceptance walk). Taken before shipping deliberately: this PR is
  the MCP surface's first release, so shipping on the superseded 2025-11-25
  revision would have dated the product's headline surface on day one.
  _(Supersedes this entry's two earlier states: "the SDK does not implement it
  yet — the gap is upstream", then "the upgrade is now ours to make, but not
  taken in this PR".)_

  What the door does now: it composes v2's `createMcpHandler` (a per-request
  server factory, `legacy: "stateless"`, `responseMode: "json"`) instead of
  hand-driving one transport per request. That entry is what serves the modern
  era — a bare transport does not, proved by probe before and after: the old
  wiring answered `server/discover` "Method not found" and rejected the
  `2026-07-28` header as "Unsupported protocol version"; the new one answers
  `server/discover` with `supportedVersions: ["2026-07-28"]`, the authored
  instructions, and the real tool list. **2025-era clients keep working**
  through the same stateless idiom the gateway already shipped, so the upgrade
  is not a cutoff. Both eras are pinned by tests in
  `content-gateway.db.test.ts` (a hand-built modern envelope — the MCP client
  itself negotiates either era and would stay green on the old one).

  Decision 13's transport choice STANDS — v2 keeps
  `WebStandardStreamableHTTPServerTransport`; only the entry changed. v2 also
  deprecates its transport-level `allowedHosts`/`enableDnsRebindingProtection`
  in favour of external middleware, which is what this door already does, and
  its dependency weight falls (`server` → `zod` + `core`; the Node middleware
  is `@hono/node-server`, already carried) rather than rising. The seven
  security controls were re-verified against the new wiring as the acceptance
  for the swap.

- **No schema migration runner**: `schema.sql` is one file, versioned in
  `schema_meta` (2.1). That is correct while no adopter has production data
  (nothing is released). Before adopters do, a forward-migration path
  (versioned plain SQL + a runner keyed on `schema_meta`) is owed —
  recorded as a decision in `research/kernel-conversion.md`.

## Designed, not implemented

- `ksor dev` / `build` — still exit `2` with an honest notice; the scaffold's
  own `pnpm dev` / `pnpm build` work today without them.
  `ksor serve`, `ingest`, `schema`, `calibrate`, `gc` ARE implemented — the
  bundled kernel provides them from the one `ksor` binary. `serve` runs the
  MCP server in-process (reads `./instance.md`; exits `3` with a remedy when
  it is missing). Verified via a real `pnpm pack` → `npm install`. Not yet
  released (pending the changesets release; the existing `@panaversity/ksor`
  publish setup covers it — no new package to bootstrap).
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

- **`GEMINI_API_KEY`** is configured as a repository Actions secret (owner,
  confirmed 2026-08-20) — the kernel conversion's gated live tiers (retrieval
  - calibration evals) embed for real (decision 11).
- Flip the org setting **"Allow GitHub Actions to create and approve pull
  requests"** — until then every release's Version-PR needs the manual
  rescue documented in the `$release` skill. (The npm Trusted Publisher is
  configured — 0.0.1 published through it.)
- Repoint the **`vsor` PyPI Trusted Publisher** — it still names
  `panaversity/zia-vertical-system-of-record`, which no longer resolves; a
  release tag today passes every gate and fails at upload.
- Tell the **sor-agentfactory** maintainers the destination changed: five PRs
  making `sor-content` embedding-provider-agnostic now serve upstream hygiene,
  not the crossing — and PR 2's blast radius includes the nightly
  eval-before-flip gate.
