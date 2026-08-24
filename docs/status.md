# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-25.

## Published package

`@panaversity/ksor` **0.0.35** on npm (trusted publishing, provenance
attached). It ships the working `ksor init` described below — including the
visibility model and the deploy story — AND the bundled content kernel, so
`ksor serve`, `ksor ingest`, `ksor schema`, `ksor grant`, `ksor takedown`,
`ksor calibrate` and `ksor gc` all run from the one `ksor` binary. Only `dev`
and `build` still report "designed but not implemented" and exit `2`; an
unknown verb is refused with exit `1` and a stable `error: unknown-verb` stderr
slug. The package root exports `exitCodes`, `verbs`, and `resolveCommand`, and
docs ship inside the tarball under `docs/`.

Verified end to end against each published version. The full KERNEL walk was
last run against **0.0.18** (2026-08-22: fresh `npm install` into a bare
project, driven by the real `@modelcontextprotocol/client` SDK over live
Postgres 17.7 + pgvector 0.8.2 with real Gemini embeddings) and has not been
re-run since. 0.0.19–0.0.22 changed the site surface; 0.0.24–0.0.29 DID change
the door's registration and auth surfaces, and those were proven differently —
live, from claude.ai as a real MCP client against a real deployment (the next
section). This page says which walk covered what rather than letting a version
bump re-attribute one. What that walk covers: install · `schema` ·
`grant` · first `ingest` builds and flips · a **second ingest consumes nothing**
("unchanged — generation N already serves this corpus") · the shrink guard
refusing a catastrophic deletion · `serve` boots and prints its posture · three
MCP tools answer · `search` returns cited passages carrying their generation ·
`read` is byte-faithful and carries provenance pinned to the serving generation
· snapshot pinning survives a generation flip · both surfaces refuse a
withdrawn document.

### Deployed live, both surfaces, with auth (0.0.23–0.0.35)

Deployment stopped being prose and became shipped artifacts, then a walked
deployment:

- `ksor init` emits a `Dockerfile` and `.dockerignore` (decision 8 revision
  2026-08-23). The Dockerfile names no host, and `vercel.json` grew from one
  static build to TWO services behind one domain — site + door — POINTING AT
  the Dockerfile rather than replacing it, so moving hosts is a redeploy, not
  a rewrite. A test asserts that neutrality directly.
- Verifying live before shipping earned its cost twice. A project-level
  `trailingSlash: true` — harmless while the project was static-only —
  308-redirected every door route **including `POST /mcp`**, which would have
  broken the MCP endpoint of every adopter who deployed. And the first
  `.dockerignore` cut `system/` from the image, so the adopter's own tool
  registration never reached the container and the door silently served the
  defaults (fixed 0.0.25/0.0.26; the Dockerfile also names the files it
  copies instead of `COPY . ./`, which a host that ignores `.dockerignore`
  turned into a 643 MB upload).
- A real record runs at **ksor-book.vercel.app**: site + MCP door, one domain,
  Neon Postgres, real Gemini embeddings. The door's auth was proven from
  **claude.ai as a real MCP client** — the full OAuth dance with RFC 8707
  resource indicators and dynamic client registration off — against BOTH
  Auth0 and the Panaversity SSO (Better Auth): the vendor-free claim
  demonstrated rather than argued.
- The docs shipped with the walk, not before it: `deploying.md`,
  `ingesting.md`, `tool-surface.md`, and `authorization.md` with four worked
  provider recipes (Keycloak, Ory Hydra, Auth0, Better Auth), each written
  around the confusions because each was got wrong first on a real tenant.
  `deploying.md` and `ingesting.md` were then read cold by someone who had
  never used the product and corrected from their report (0.0.33).

- Re-walked on **0.0.35** the day it published (2026-08-24): the record was
  re-scaffolded from the registry, redeployed, and both surfaces exercised
  live. The DOOR: `POST /mcp` answers curl `401` with its RFC 9728
  `resource_metadata` challenge, and claude.ai — connected via OAuth against
  the Panaversity SSO — ran `search` and returned the passage byte-exact with
  its citation (`stable_id: knowledge/what-is-a-ksor`, `generation: 5`) and a
  generation-pinned snapshot token; the client also relayed the envelope's
  own `gate: "off"` disclosure, which is the honest-absence posture doing its
  job on a record with no calibrated floor. The SITE: the 0.0.35 sign-in
  control live on the same domain — sign in against Auth0, the reader's name
  and email in the navbar, sign out returning the control. Two different
  identity providers on one deployment, neither named in framework code.

### A record can raise its voice, and a reader can unwrap a line (unreleased)

The document page gains the affordances a written record actually needs, all
of them defaults in the scaffold rather than things to configure.

A passage the reader must not miss is a CALLOUT, written in GitHub's alert
syntax (`> [!WARNING]`) and rendered as a panel tinted in that kind's colour
with a rule down its left edge. Not `:::warning`: a dialect renders as literal
colons in every reader except the one site that understands it. The conversion
is a REHYPE step, because this record's markdown is serialized from the mdast —
doing it in remark publishes `<Callout>` to the agent surface in place of the
author's blockquote, which is what the first build of it did.

A code block wider than the column gets a button beside its copy button that
wraps it, and one that fits gets no button at all. Wrapping everything by
default was tried and reverted: a yaml file rewrapped at the column reads as
though its indentation means something else.

The rest is typography with a reason: a table head that reads as a head and
rows that alternate, a numbered list whose markers count in the accent, the
term a list item defines picked out, and a language-less fence set as a passage
to reproduce rather than as code — selected by the absence of shiki's own
token colours, so nothing has to be authored.

Two things this exposed rather than caused. A document with no summary was
rendering a full-width rule under an empty band holding one number; the reading
time moved into the governance row beside the owner and effective date. And the
reset that keeps the top of a document from moving with the author's choice of
first block targets `.prose > :first-child`, which the first block has not been
for some time — every document was starting 20px low.

Pinned on the SHIPPED BYTES: a test asserts the export's own stylesheet carries
the rule for each affordance and that an alert became a callout rather than a
marker served as text, with the markdown twin asserted in the same test because
that is the clause that fails if the conversion moves to remark. Proved it can
fail by disabling one rule and watching it go red.

### The site names its reader (0.0.35)

The scaffolded site gains an optional sign-in control: OAuth 2.0
Authorization Code + PKCE against a public client, endpoints discovered (RFC
8414, then OIDC — no vendor named anywhere), session in `sessionStorage` for
the tab, no refresh token requested. Off unless three `NEXT_PUBLIC_KSOR_*`
variables are set at build time; unconfigured it renders nothing at all. It
NAMES an already-authenticated reader — it does not gate, and
`deploying.md`'s "Naming the reader" section leads with that, beside the
section that says what actually keeps people out of a static export. Walked
live against a real Auth0 tenant before landing: sign-in, consent, session,
sign-out, a forged callback refused on state before any code was redeemed,
an issuer decline rendered honestly. The state-before-redemption assertion
is mutation-tested. Also fixed the gap the work exposed: the site build
never read the repository-root `.env`, so the scaffold's own instructions
set variables that silently never reached the bundle.

### The tool surface is adopter-owned code (0.0.24, decision 23)

`ksor init` emits the MCP tool REGISTRATION — ordinary `registerTool`,
ordinary zod — into `system/gateways/content.ts`, importing from
`@panaversity/ksor/gateway`. Renaming a tool, tightening a description,
dropping or adding one is editing a file the adopter owns; a config API was
built first and discarded, because models are trained on the MCP SDK and zod,
not on invented field names. What stays in the package: the handlers (only
they can prove a passage came from the governed record), the output schemas,
and the floor text. The exchange is prevention for verification — the door
inspects its OWN served surface at boot over a real in-memory MCP handshake
and refuses `ksor-gateway-floor-missing` / `ksor-gateway-no-tools`. Deleting
the file is supported and asserted: the compiled default serves the identical
surface, compared over the protocol. The measurement that motivated it: three
tool definitions cost ~2,990 always-resident tokens and one default `search`
call ~3,541 — an agent pays for a record's tool surface out of its context
window, so the record's owner decides what it says.

### One auth switch, spelled like what it does (0.0.29)

**Breaking:** `KSOR_AUTH_DISABLED` and `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED`
are replaced by one `KSOR_AUTH` with two explicit values — `disabled-local`
(loopback only) and `disabled-public` (a public bind that really means to be
open, written out). The fail-closed posture is unchanged: no SSO configured
and no explicit disable still refuses to boot.

### One shell (0.0.34)

The second site shell is retired (decision 9 revision 2026-08-24, owner):
every surface the record grew had to be built twice to keep the conformance
suites green, for a shell no adopter runs — `ksor init` has always emitted
Fumadocs and there was never a selector. The five-clause surface contract is
unchanged and still asserted against the one implementation; both suites keep
their `.each(SHELLS)` shape, so a shell returning needs no restructuring.
Restored by an adopter actually swapping one in; the recipe is in git history.

### What a concurrent build found (0.0.22)

Walked from the registry on 2026-08-23: `npm install @panaversity/ksor@0.0.22`
into a bare project, `ksor init`, `pnpm install`, then six real `next build`s.
The out-of-the-box (level-0) build renders the shipped record; three consecutive
internal builds each stage all 66 documents and leave no lock behind; and an
internal/public pair stages 66 against 65 — exactly the one restricted document
— with no trace of its body or title anywhere in the public output, against a
240-page positive control that proves the sweep was not blind.

That pair is the guarantee; the count is what was broken. A site build evaluates
`source.config.ts` in **seven** processes, and staging was destructive on every
one of them — delete the whole per-audience stage, refill it — so seven
processes deleted trees the others were copying into. Six concurrent evaluations
of a 150-document record failed **42 of 48 runs**: `ENOENT` and `EINVAL` out of
`copyFileSync`, `ENOTEMPTY` out of `rmSync` despite the retries added for it,
and — 27 of the 48, the majority — no error at all, staging returning SUCCESS
with a third of the record missing.

The silent shape is the one that shipped. A crash fails a build; a short stage
PUBLISHES one, with documents missing from `/docs`, `llms.txt` and the search
index and nothing anywhere saying so. Staging now takes a pid-stamped lock (so a
killed build's lock is broken rather than waited on) and skips the rebuild
entirely when the stage already holds exactly its plan, byte for byte — so the
destructive path runs once per build, alone (issue #100).

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

- **The shell swap seam** — the surface contract's five clauses, the
  `order:` translation, and the base-path build run as one shell-agnostic
  conformance suite. It was proven with TWO implementations (a Docusaurus
  shell at `workbench/shells/docusaurus/`, predecessor-based) until
  2026-08-24, when the second shell was retired (decision 9 revision): every
  new surface had to be built twice for a shell no adopter runs. The suite
  keeps its `.each(SHELLS)` shape; `ksor init` emits Fumadocs, always.

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

- **Governance rendering on the site**
  (`specs/ksor/site-governance/spec.md`, issue #29) — the record enforces
  `status` / `owner` / `provenance` / `effective` / `superseded_by` on every
  document, and the site rendered none of them. Now each document shows the
  governance it declares: owner and effective date under the title, one entry
  per `provenance` source at the foot, a status chip **only when the status is
  a caveat** (`draft` / `review` / `superseded` — an `approved` document shows
  none, because that is what a reader already assumes and a label that never
  varies stops being read), and — above the title,
  where it cannot be missed — a supersession notice naming the successor and
  linking to its route. This closed a correctness gap, not only a cosmetic
  one: a `status: superseded` document was served looking identical to an
  approved one, with the successor pointer the checker demands swallowed.
  Nothing is inferred — an undeclared key renders nothing, never a placeholder
  that would read as governed. All server-rendered, so it survives print, a
  failed bundle and JavaScript off (verified live in both themes). The
  Publication is the owner's call: `site: governance: false` in instance.md
  leaves the pages plain while the record keeps every key for the agent
  surface and the audit trail — and it never hides the supersession notice.
  `pnpm check` and the build both refuse a value that is not `true`/`false`.
  The **agent files carry the same governance**: `llms.txt` marks a caveat
  status and names the route that replaced a superseded document, and
  `llms-full.txt` restores each document's keys as frontmatter above its body.
  Without that half, a build warned a reader about a withdrawn policy and handed
  an agent the same policy as clean prose — one source, two truths (measured on
  shipped bytes, `research/site-design.md` F1). `site: governance: false` is a
  decision about the PAGES and never reaches those files.
  Fumadocs shell only: bound there rather than as a surface-contract clause
  (owner, 2026-08-20), so a project that swaps shells loses it until its shell
  adds it. Released in 0.0.21.

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

- **Smaller shipped truths (0.0.28–0.0.33):** each document page reports its
  reading time, counted at build time from its own markdown (0.0.28). The
  door's per-tool instructions render as tabs (0.0.32). The MCP door gained
  its first slice of standing adversarial governance coverage (issue #33,
  0.0.31). And the site's search index no longer pins English tokenization —
  a record written in Urdu, Chinese, Japanese or Korean was published
  complete and silently unsearchable; the pin bought nothing on English text
  (measured: `english` and `multilingual` return identical results under
  ZBSearch) and is removed (0.0.33).

- **Presentations** (`specs/ksor/slides/spec.md`, released in 0.0.31).
  `<doc>.slides.yaml` is the FIFTH attachment, on the same rule again — the
  suffix list changed and the guarantee did not. It renders at the TOP of the
  document's page, before the prose, because a deck is the shape of the thing
  and gives the detail somewhere to land.

  Two modes, and the DEFAULT is the one the record owns: `deck:` carries the
  slides themselves and the site renders them. That is what makes the workflow
  complete — `.agents/skills/make-slides/` reads a document and writes the deck
  end to end, with no browser, no third party and no human step in the middle.
  It is also the only mode where the deck is governed: reviewed in the same
  pull request as its document, versioned with it, withdrawn with it, and
  incapable of rotting into a dead link.

  `slides.url:` embeds a deck hosted elsewhere, for an adopter who already has
  one. Its frame is CLICK-TO-LOAD, because the browser suite asserts zero
  external requests on a built page and that guarantee is worth more than the
  autoplay — verified: an owned deck ships no `<iframe>` at all, and a linked
  one ships none until a reader asks. Declaring both modes is refused
  (`ksor-slides-two-sources`): two presentations with nothing to say which one
  governs is the disagreement this product exists to settle.

  Every slide is in the SERVER-rendered html, so a reader without JavaScript,
  a crawler and an agent parsing the page all get the whole deck; only
  navigation is client-side. Presenter notes render outside the stage, so they
  are not projected in fullscreen. No seed deck ships: every other attachment
  seeds content we authored, and a slides attachment pointing outside the repo
  could only seed a third party's deck or a dead link.

- **Quizzes** (`specs/ksor/quiz/spec.md`, released in 0.0.30). A
  document may carry `<doc>.quiz.yaml` as a THIRD attachment, on the same rule
  as the summary and the deck — so no route, no `llms.txt` line, no stable id,
  and its parent's tier and takedown, all inherited rather than
  re-implemented. It renders under the deck in the study-aids region: choose,
  see immediately whether you were right, read the explanation. No pass mark,
  and answers stay in the reader's browser.

  Because ingest creates no node, **the answer key cannot reach the MCP
  surface** — the question issue #35 raises about whether an agent should get
  a quiz's answers is settled by the row not existing, rather than by a filter.

  The predecessor's quiz audit is carried, and carried as a REFUSAL rather
  than a script: five checks run inside the schema, so a quiz a reader could
  pass by guessing cannot be loaded. `ksor-quiz-answer-bias`,
  `ksor-quiz-length-bias`, `ksor-quiz-answer-run`, `ksor-quiz-contradiction`,
  `ksor-quiz-duplicate-stem`, each naming the questions to fix. Its own
  README records these as bugs that shipped and were found by students — one
  quiz with every correct answer in the same position across 451 questions —
  and its findings file still reports 88% pick-longest in one file, which is
  what an advisory checker is worth. Run against that project's real data, the
  audit reports 67% of answers at option C and 78% pick-longest on the 18
  parsed questions of its `11-chapter-quiz.md`.

  Thresholds diverge deliberately: 60% floors rather than the predecessor's
  15–35% distribution target, and no ratio check below five questions, because
  a five-question bank cannot satisfy a distribution without the checker
  choosing an author's answers. Verified live on a built scaffold — quiz text
  in **0** files outside its document's own page, parent's `/md/` and both
  llms files **byte-identical** with and without it, zero console errors, both
  themes. The seed quiz `ksor init` ships was itself refused on first draft
  for putting four of five answers at option B.

- **Study attachments — summaries and flashcard decks** (decision 24,
  `specs/ksor/study-attachments/spec.md`, released in 0.0.28). A
  document may carry `<doc>.summary.md` and `<doc>.flashcards.yaml` beside it.
  The summary joins the record's own words as a second TAB — the two readings
  of a document. The deck renders at the END of the page, in the region the quiz
  now shares, because a study aid is used after reading and a tab would hide
  the document while you used it. `ksor init` ships one of each on the seed
  document. Presence-driven: a document with neither gets no tab strip and no
  region at all (verified live: a page without attachments renders zero
  `role="tab"` elements).

  An attachment is part of its document, not a document. Verified on the
  shipped bytes of a scaffold built from the packed CLI: **no route, no `/md/`
  twin, no `llms.txt` or `llms-full.txt` line, no search-index entry**, and the
  parent's own `/md/` and both llms files are **byte-identical** (sha-256) with
  and without attachments present. Governance inherits: with the parent set to
  `visibility: internal`, a public build contains the summary and deck text in
  **0** files against a positive control of 26. `ksor ingest` creates no node
  for either, so neither is independently citable — previously `isDoc` accepted
  `x.summary.md` and gave it its own `stable_id`, which is the one cause behind
  four cross-surface leaks (decision 24).

  Refusals carry remedies and fire in both `pnpm check` and `pnpm build`:
  `ksor-attachment-orphan` (an attachment whose document is missing) and
  `ksor-attachment-frontmatter` (an attachment declaring any frontmatter — the
  rule that closes `visibility:` widening, `sor_id:` takedown escape, and
  claimed governance a non-node cannot carry). `.yml` is refused by name.

  Each document also reports how long it takes to read, counted at build
  time from its own markdown — so the figure is in the shipped HTML rather than
  measured in the browser after paint. Fenced code and frontmatter are excluded
  from the count. Where a summary exists both tabs carry their own figure.

  Scheduling is `ksor-sm2-v1`, a two-grade SM-2 variant — **not FSRS**, no
  retention target claimed, with what it gives up recorded beside the code. Its
  transition table is asserted for every state x rating pair against a frozen
  clock, and the ladder it produces is measured in the suite: 10 min, 2 d, 5 d,
  13 d, 33 d.

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
  and a **serve deploy recipe — DONE in 0.0.23–0.0.27**: the scaffold ships
  the `Dockerfile`/`.dockerignore`, `vercel.json` deploys both services behind
  one domain, and `deploying.md` is the managed-Postgres guide — walked live
  (see "Deployed live" above).
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
