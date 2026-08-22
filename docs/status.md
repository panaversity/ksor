# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-22.

## Published package

`@panaversity/ksor` **0.0.18** on npm (trusted publishing, provenance
attached). It ships the working `ksor init` described below — including the
visibility model and the deploy story — AND the bundled content kernel, so
`ksor serve`, `ksor ingest`, `ksor schema`, `ksor grant`, `ksor takedown`,
`ksor calibrate` and `ksor gc` all run from the one `ksor` binary. Only `dev`
and `build` still report "designed but not implemented" and exit `2`; an
unknown verb is refused with exit `1` and a stable `error: unknown-verb` stderr
slug. The package root exports `exitCodes`, `verbs`, and `resolveCommand`, and
docs ship inside the tarball under `docs/`.

Verified end to end against each published version (most recently 0.0.18,
2026-08-22: fresh `npm install` into a bare project, driven by the real
`@modelcontextprotocol/client` SDK over live Postgres 17.7 + pgvector 0.8.2
with real Gemini embeddings). What that walk covers: install · `schema` ·
`grant` · first `ingest` builds and flips · a **second ingest consumes nothing**
("unchanged — generation N already serves this corpus") · the shrink guard
refusing a catastrophic deletion · `serve` boots and prints its posture · three
MCP tools answer · `search` returns cited passages carrying their generation ·
`read` is byte-faithful and carries provenance pinned to the serving generation
· snapshot pinning survives a generation flip · both surfaces refuse a
withdrawn document.

### What attacking the door found (0.0.18)

Before exposing the MCP surface publicly, five independent attackers ran against
it — one per guarantee — each trying to break it and each verified adversarially
afterwards. Three holes were confirmed by live reproduction against real
Postgres; two are fixed, one is a decision.

- **A takedown stopped applying when the document moved.** Denials are recorded
  against a `stable_id`, and the serving predicate matches them against the
  documents in the generation being served — so an id that no longer exists
  denied nothing. Since ids are path-derived, an ordinary rename was enough:
  search, read, outline and the site all served a withdrawn document again, with
  no error anywhere. Both the ingest that would create that state and the door
  that would serve it now refuse (issue #85).
- **A withdrawn section did not cover its own directory** when it had no
  `index.md` and its documents lived a level below, so a file written directly
  under it published to the site (issue #86).
- **A snapshot pin outlives a governance change** — a pre-flip token reads a
  just-restricted document for up to the token TTL. Open deliberately: pins exist
  so citations stay stable and governance exists to revoke, and which yields is a
  product decision (issue #87).

Attacks that HELD: DNS-rebinding via the Host header in every spelling tried,
unauthenticated public bind across every host form, empty audience allowlists,
and audience isolation across search, read, outline, citations, counts and
positions.

### Install weight (0.0.17)

`npx @panaversity/ksor init` installed **54 MB across 52 packages**; 32 MB of
that was `@google/genai` and its dependencies, carried by every adopter
including those who never reach a served rung. It made two HTTP calls, both
already behind one typed client boundary, so those calls are now spoken
directly: **22 MB, 22 packages**.

The swap was gated on a measurement taken before any code was written — the SDK
and the REST endpoint return **byte-identical vectors** for the same text, model,
`outputDimensionality` and `taskType` (max per-component difference 0.000e+0 at
1536 dimensions). Stored embeddings and calibrated floors therefore keep their
meaning; had they differed by a rounding step the swap would have silently
invalidated `vector_floor` everywhere. The provider seam is unchanged and a
deployment may still supply an SDK client through `clientFactory`.

### What a real foreign corpus found (0.0.16)

An 81-document Docusaurus book — 8.4 MB, 6,912 chunks — ingested with 0 failures
and answered real questions at rank 1. It also surfaced three defects that no
fixture had, each fixed in 0.0.16 and each verified against the published
package:

- **A quiz swallowed the explanation before it.** Widget dominance still decided
  by length after navigation had moved to shape, so a section carrying a
  complete 180-character explanation before a knowledge check lost the
  explanation too. On that book: unsearchable **1,010 → 816** of 6,912, with 196
  chunks moving back to prose and `nav` unchanged at 91.
- **A YAML list discarded a document's whole metadata.** One `authors: ["…"]`
  line beside the title emptied the map, so four chapters were served under
  filename-derived names — "The System of Context: Connecting the Records to
  Real Work" as "System Of Context". The reader claims PyYAML compatibility and
  PyYAML parses a flow sequence; only what PyYAML REJECTS empties the map now.
- **An ordering key was ignored in silence.** 73 files declared
  `sidebar_position`; reading order fell back to file name — alphabetical — and
  nothing said why. That order is what `llms.txt`, the sidebar and `outline` all
  serve, so the book was served scrambled. Ingest now names the key, the count
  and the remedy.

Two things the same walk measured and did not change: at 6,912 chunks the
database search costs **75 ms** against a **1,571 ms** query, so the embedding
round trip is ~95% of what a user feels (issue #59 is a smaller prize than it
looks); and abstention calibrated against scope-adjacent probes **did not
separate** on that corpus — `ksor calibrate` refused to emit a floor rather than
paste one that leaks, which is the fail-closed posture working.

### Retrieval, measured rather than asserted

On real Gemini embeddings, against questions written so that the answer shares
almost no vocabulary with the question (2026-08-21):

- **vector arm: 8/8 correct at rank 1.**
- **keyword arm: 0/8 — it returned nothing at all, 8 times out of 8.**
  `websearch_to_tsquery` ANDs its terms, so a natural multi-word question
  matches nothing. The shipped "hybrid" is empirically vector-only for the
  query shape this product exists to serve; the keyword arm earns its place on
  exact-term lookup, not on questions.

**Short documents reach search again** (issue #55, fixed 2026-08-22, released
in 0.0.15). Sections
were classified navigation by LENGTH — anything under 250 code points — and
navigation is excluded from every retrieval arm. Walked on 0.0.14 with three
ordinary short policy statements: three of four chunks unsearchable, and a
question the record plainly answered was served the scaffold's placeholder
instead. Navigation is now decided by SHAPE (link-dominated, or too little text
left to answer anything), which is what the word always meant. Measured on the
handbook gold with real Gemini embeddings: short substantive facts **0/9 → 9/9
at rank 1**, the long-prose control held at **4/4**, and the link-list negative
was returned **0** times — correctness, not permissiveness. The recorded line
lives in `packages/content/src/evals/baseline.ts` and the harness prints every
run against it. Adopters get it by re-running `ksor ingest`; unchanged content
is not re-embedded.

Re-walked on published 0.0.15 with the corpus that failed on 0.0.14 — the same
three short policy statements plus an index page of links. Unsearchable went
from **3 of 4 chunks (75%)** to **1 of 5 (20%)**, and the one is the index page,
which is what navigation means. All three questions the record answers now
return the right document at rank 1, and the index page appears in no result:

```
Q: how long does a buyer have to send something back
   -> refunds, escalation, badges       (0.0.14 returned the placeholder page)
Q: who handles a dispute the agent cannot settle
   -> escalation, refunds, example
Q: what happens if I lose my badge
   -> badges, escalation, refunds
```

**The vector index is NOT being used, and fixing it is a governance decision**
(issue #59, diagnosed 2026-08-22). `idx_chunks_hnsw` is built and maintained,
and the query `ksor serve` sends plans a sequential scan instead: measured
**648 ms** at 20,001 chunks. Answers are correct — a sequential scan is EXACT —
but the work to get them grows with the corpus.

The cause recorded here previously (a window function, then joins and
unestimable predicates) was incomplete. Each clause was tested on its own; the
root is a cost mispricing, with three compounding contributors:

- Postgres prices a full sequential pass over 20,000 chunks — including 20,000
  × 1536-dimension distance computations — at **1904**, work that actually takes
  ~130 ms. The HNSW scan's startup cost alone is 2137, so the index can only
  win at small `LIMIT`s.
- The ordered scan must therefore touch `chunks` with estimable predicates only.
  `SERVABLE` inside it flips the plan back to sequential: **478 ms inside, 2.3 ms
  outside**, same rows.
- `hnsw.ef_search = 100` raises the cost further, and the ceiling is
  size-dependent: at 20,000 rows the index is chosen up to 80 and lost at 90; at
  5,000 rows it is never chosen at any setting — correctly, since a sequential
  pass over 5,000 rows is fast _and_ exact.

A restructured arm (order over `chunks` alone, overfetch ≤ 100, filter after)
reaches **36 ms against 648 ms** — but only with `ef_search` at pgvector's
default, and that is the setting where, on a bed with real cluster structure,
the index **missed the true nearest neighbour for 1 query in 100**, dropping the
top-1 similarity by 0.99. This record's measured in-corpus/out-of-corpus
separation is ~0.01, so a miss that size flips an ABSTENTION: the corpus holds
the answer and the door says it does not.

So the speed and the approximation cannot be separated, and taking it is an
owner decision rather than a tuning change. Both the plan and the fix path are
pinned by `packages/content/src/lib/vector-plan.db.test.ts`, which fails if
either stops being true.

## Implemented (released in 0.0.7)

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

## Released since 0.0.7

- **The content kernel and the MCP gateway** (decision 11, in progress on
  the kernel-conversion branch): four workspace packages — postgres (Postgres access
  discipline: pooling, scoped transactions, retry classification), content (schema + ingest + hybrid retrieval
  - calibrated abstention + read plane), gateway-kit (fail-closed serving
    postures), content-gateway (the content MCP door: search/outline/read over stateless
    Streamable HTTP — one transport, loopback by default). BUNDLED into
    `@panaversity/ksor` (decision 12, publish revision 2026-08-20): the CLI
    inlines all four and exposes ONE `ksor` binary with every verb —
    `init`/`dev`/`build`, `serve` (the MCP server, in-process), and
    `ingest`/`schema`/`grant`/`calibrate`/`gc`; the four kernel packages stay
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
    first-class in every new project. **Released in 0.0.8-0.0.18.**

- **Governance, honesty and measurement work (0.0.8-0.0.18, 2026-08-21/22).**
  Reading order is one rule across the website, `llms.txt` and the MCP
  `outline` tool — the door had been reading the predecessor's Docusaurus keys,
  which no compliant record may declare. `ksor serve` reports its own posture
  in one aligned block instead of forwarding the driver's and the SDK's
  warnings; a remote `sslmode` is written out as `verify-full` rather than
  warned about. Every 401 from the MCP door carries its `WWW-Authenticate`
  challenge, not only the one for a missing token. A 503 refusal no longer puts
  the database host, port or user on the wire. `ksor takedown` refuses a
  governance act with no `--actor`. A refused ingest does not publish, and the
  shrink guard covers the CLI's flip path again. Signing keys are discovered
  from the authorization server's own metadata rather than one vendor's path.
  **A provider outage is never reported as "the record does not cover this"**,
  and `ksor calibrate` states what its measurement is worth: the door's
  vocabulary bias, the separation margin with the probe counts behind it, the
  generation it measured, and — when the out-of-corpus probes are the built-in
  far-domain set — that a floor blessed by them may still leak near-misses.

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
  independently specced: a dedicated **`serve-setup` skill** in the
  scaffold agent kit (today the runbook lives in the scaffold `AGENTS.md`,
  which every coding agent reads first — a skill must first be shown to beat
  that);
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

- **Schema migrations — DONE.** `schema.sql` provisions a FRESH database at the
  current version (2.4); an existing one moves forward through
  `schema/migrations/<from>-<to>__<slug>.sql`, applied by a runner keyed on
  `schema_meta`. The chain is WALKED, not sorted, so a missing step refuses
  rather than being skipped, and each step commits with the `schema_meta` row
  that records it. `ksor schema --apply` compares versions instead of checking
  presence. This retires the "drop and recreate the database" remedy, which
  destroyed `retrieval_log` and `takedown_denylist` — the only two tables that
  cannot be rebuilt from markdown.

- **The governance boot gate — DONE.** `ksor serve` refuses two states the SITE
  already refuses to build in, because a door that serves where the site stops
  is the two surfaces reading different truths. A generation built before
  schema 2.2 carries no `visibility` at all — the 2.1 → 2.2 migration added the
  column and cannot backfill frontmatter — and the serving predicate reads a
  NULL as `default_visibility`, the WIDEST tier; 2.4 stamps each generation
  with the schema it was built against, so that state is detectable and
  refused. A document declaring `visibility:` in a record that declares no
  `audiences:` is refused too, matching the site's
  `ksor-visibility-without-audiences`.

- **Subtree takedowns reach the site — DONE.** The exported manifest carries
  the DIRECTORIES a `--subtree` denial governs alongside the expanded id list,
  derived from the descendants' `sources.origin_path`. The id list can only
  name what the active generation holds, and the site builds from disk: a
  document added under a withdrawn section after the last ingest was published
  to `/docs` and `llms.txt` with no warning.

## Designed, not implemented

- `ksor dev` / `build` — still exit `2` with an honest notice; the scaffold's
  own `pnpm dev` / `pnpm build` work today without them.
  `ksor serve`, `ksor ingest`, `ksor schema`, `ksor grant`, `ksor takedown`,
  `ksor calibrate` and `ksor gc` ARE implemented and released — the bundled
  kernel provides them from the one `ksor` binary. `serve` runs the MCP server in-process (reads `./instance.md`; exits
  `3` with a remedy when it is missing).
- Build provenance records (`build.lock.json`) — designed with `ksor build`.
- Governed directives (`:::quiz` etc.) — no grammar ratified yet; shells
  pass them through as readable text (spec, deferred 2026-08-18).
- The agent-eval harness's RELEVANCE and CORRECTNESS classes. The
  **behavioural** class — the one the contract says gates — now exists at
  `packages/content/src/evals/behavioural.db.test.ts`: citations resolve to a
  readable generation, the abstention gate is disclosed on every envelope, and
  an unpublished generation is never served (all three deterministic, any
  provider), plus in/out-of-corpus separation and abstention across a
  scope-adjacent near-miss, measured in a real embedding space where a key is
  configured.

  **What the first real run measured, and it matters**: against
  `gemini-embedding-001`, the near-miss "what is the approval threshold for
  hiring a contractor" scores **0.683** on the example corpus, ABOVE the weaker
  in-corpus question at **0.671**. No single cosine floor both answers
  "what happens if a purchase is split" and declines the hiring question. The
  eval therefore GATES the mechanism (given a floor, everything below it
  abstains and everything above still answers) and REPORTS the corpus's
  separation margin rather than asserting it — separation is a property of the
  corpus and its embedding space, and `ksor calibrate` already names this exact
  state "NOT separable" and refuses to hand out a floor for it.

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

- **`GEMINI_API_KEY`** is a repository Actions secret and works (owner,
  re-set 2026-08-21 after a rejected credential failed the gated live tiers
  with `ACCESS_TOKEN_TYPE_UNSUPPORTED`). It must be a Gemini API key from
  Google AI Studio — not a Vertex credential, an OAuth token, or a service
  account. The live tiers skip silently without it and fail loudly with a bad
  one, which is the right way round.
- ~~Flip the org setting **"Allow GitHub Actions to create and approve pull
  requests"**~~ — **done 2026-08-21.** The Release workflow opens the Version
  PR itself; releases 0.0.7-0.0.11 were hand-rescued. One consequence to know:
  a bot-opened Version PR's CI **waits for approval**, so `gh pr checks` reports
  "no checks reported" until someone approves it — which reads like a repo with
  no CI and is not. Runbook: `.agents/skills/release/SKILL.md`.
- Repoint the **`vsor` PyPI Trusted Publisher** — it still names
  `panaversity/zia-vertical-system-of-record`, which no longer resolves; a
  release tag today passes every gate and fails at upload.
- Tell the **sor-agentfactory** maintainers the destination changed: five PRs
  making `sor-content` embedding-provider-agnostic now serve upstream hygiene,
  not the crossing — and PR 2's blast radius includes the nightly
  eval-before-flip gate.
