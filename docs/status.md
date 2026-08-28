# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-09-02.

## Published package

`@panaversity/ksor` **0.0.58** on npm (trusted publishing, provenance
attached). It ships the working `ksor init` described below — including the
visibility model and the deploy story — AND the bundled content kernel, so
`ksor build`, `ksor migrate`, `ksor dev`, `ksor serve`, `ksor ingest`,
`ksor schema`, `ksor grant`, `ksor takedown`, `ksor calibrate` and `ksor gc`
all run from the one `ksor` binary. The scaffold ships THREE skills —
`intake-interview`, `add-sources`, `format-checker`; `make-slides` and
`make-summary` were removed after 0.0.55 (they remain in the history below as
what 0.0.38 added). `add-sources` 2.0.0 takes a file or a person as its source
and ships `verify.mjs`. A fourth test tier, `pnpm test:agent`, runs a skill by
a real coding agent with and without it (decision 31); **it needs an
`ANTHROPIC_API_KEY` repository secret, which is a pending owner action** —
until then `skill-evals.yml` runs and reports itself skipped. `ksor dev` is
the dev loop described below, not a stub. An unknown verb is refused with exit
`1` and a stable `error: unknown-verb` stderr slug. The package root exports
`exitCodes`, `verbs`, and `resolveCommand`, and docs ship inside the tarball
under `docs/`.

`ksor dev` (dev spec §1) starts the local knowledge site (`next dev` over
`system/site`) with live governance: every save re-runs the record checker in
`check` mode and prints refusals without writing `build.lock.json`, and when a
`ksor serve` is already running it proxies `/mcp` to it so the dev server is
the one URL for humans and agents. Startup preconditions (`ksor-instance-missing`,
`ksor-dev-no-site`) refuse with exit `1`; a missing runtime (`next`, the
watcher) exits `3`.

0.0.36 emitted the invoking package manager's scaffold (decision 25); 0.0.37
stated the KSoR architecture in the package README; 0.0.38 added the
`make-summary` skill, put the breadcrumb on every page and moved the teaching
aid after a document's introduction; 0.0.39 stopped a malformed
`KSOR_SNAPSHOT_KEYS` entry echoing its own text into the refusal; 0.0.40 made
a document's page more readable — an overflowing code block can be unwrapped,
table rows alternate, and a callout carries a rule down its left edge; **0.0.41
released the OKF-native record** — the profile, `ksor build`, `ksor migrate`,
schema 2.5 and the governed door described below; **0.0.42** filled in
`database.dsn_env` in the emitted `instance.md` so climbing to the served rung
needs no edit, and recorded decision 29.

0.0.43-0.0.48 were the readability and refusal pass — a document page that
reads at a glance, a `pnpm preview` for the static build to land in, refusals
that say the right thing to the right audience, and the intake interview asking
its three questions in the owner's words. **0.0.49** carried six fixes found by
walking a real record: the site builds with webpack (a bare `next build` dies
on Vercel's default machine once a record prerenders a few hundred routes),
`ksor schema --apply` no longer loses a ROLE when two run at once, `pnpm
preview` survives a URL it cannot parse, and two audit rows gained the field
that makes them auditable. **0.0.51** pinned Next `16.3.3`, clearing three
high-severity advisories a fresh `npm install` reported, stopped Next writing
its own `AGENTS.md` into the site, moved the scaffold to Fumadocs `16.15.4`,
and stopped `ksor migrate --write-site` deleting dependencies an adopter added.
**0.0.52** added `ksor calibrate --check` (is a declared floor still holding,
read from the record's own logged searches — no provider key), disclosed a shed
audit row in the served envelope, and taught the site to print natural names
for actors. **0.0.53** documented `.ksor/people.yaml` for the owner.

Everything under the next heading is RELEASED and in adopters' hands as of
0.0.41. It was developed on the `okf-native-spec` branch, which merged in
PR #161.

Verified end to end against each published version. The full KERNEL walk was
**re-run against 0.0.53 on 2026-09-01** — `ksor init` from the published
package, `pnpm install`, a hand-written document held out of every machine
surface as a draft (`6 document(s), 5 admitted`) and admitted once approved
(`6 admitted`), then live Postgres 17.7 + pgvector 0.8.2, real Gemini
embeddings on a free-tier key (`embedded 23, failed 0`), a flipped generation,
a calibrated floor measured through the zero-LLM door (`separable`, 0.622), and
the served door answering an in-corpus question with provenance and ABSTAINING
on an out-of-corpus one. Before that it had last run against **0.0.18**
(2026-08-22, driven by the real `@modelcontextprotocol/client` SDK). 0.0.19–0.0.22 changed the site surface; 0.0.24–0.0.29 DID change
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

### The record, the CLI and the kernel on the profile (released in 0.0.41)

`packages/content/src/record/` holds the OKF-native record's foundation
(`specs/ksor/record/spec.md`; decision 26): the YAML frontmatter splitter,
the concept profile as a zod schema, the Governance Policy reader with KSP
4.2.5 scope resolution, the takedown ledger reader with its four rules, the
OKF §8 index generator with a golden, footnote and link reading, the overlap,
widening and lifecycle rules with their decision tables, the hygiene rules
ported from the scaffold's hand-written checker (portable names, file types,
PNG integrity, dead and escaping links, the instance's closed key set), the
`build.lock.json` schema with `build_id` composition, and `checkRecord`,
which composes them over an in-memory tree. Exported from the kernel package
and as the `@panaversity/ksor-content/record` subpath.

**`ksor build` runs** (`specs/ksor/build/spec.md`): `--instance`, `--as-of`,
`--strict`, `--allow-unverifiable-ledger`; generates every index in memory,
checks, refuses with the slug first and nothing written, else writes the
changed indexes and the lock — `source_commit` from the last commit touching
an input, `dirty` from git status, the ledger checked for shrinkage against
every historic version and the committed lock, a shallow clone refused.
`--bundles` exits `2`. **The emitted `check.mjs` is generated** from the
record module at package-build time into both skill trees (gitignored in the
templates), read-only, refusing a stale index; a conformance fixture is judged
identically by it and by `checkRecord`. **The starter is in the profile**:
`instance.md` format 2, `.ksor/governance.yaml`, five `type: Document`
concepts, generated indexes, `surfaces/overview.md`; every manager's `build`
script is `ksor build` then the site build, `export-denylist` gone. **The
starter PUBLISHES on the first build** (owner, 2026-08-25): all five ship
`status: stable` with `ksor.approval` naming `ksor-starter/<cli version>`, a
PRODUCER actor the emitted policy authorises, so `ksor init` then `ksor build`
reports `5 admitted to a machine surface` instead of `0`. This replaces
decision 27's day-one cost, whose real price was the whole first surface — an
empty `llms.txt`, empty `/md/` twins and a door that answered nothing. The new
cost is that a non-human actor holds approval authority in the adopter's own
policy and five documents they did not write are published: the emitted README,
AGENTS.md, `.ksor/governance.yaml` and the intake-interview skill all say so,
and all four say to delete the producer once the samples are replaced. What the
owner writes is unaffected — a new document is `draft` and reaches no machine
surface until they approve it.

**`ksor migrate` runs** (research/okf-native.md §1.8): `--write`,
`--instance`, `--actor`, `--approve-by`, `--attribute`, `--generated-at`,
`--write-site`. It rewrites a pre-profile record into the profile — `visibility`
expanded UPWARD through the old ordered model, `provenance` into `sources`,
`effective` widened to midnight UTC, `review` into `draft`, `superseded` into
`deprecated` with an attributed `ksor.deprecated` and a resolved
`ksor.superseded_by`, `approved` into `draft` unless `--approve-by`, the
instance into format 2 with authority moved into `.ksor/governance.yaml`, a
reserved `index.md`/`README.md` carrying prose into `overview.md`, every
summary companion marked `type: Summary`, and every denylist row in the
database into the committed ledger. A row whose denial the ledger already
names is left alone and an existing ledger is never regenerated — `ksor
takedown` may have appended to it — but a row nothing accounts for is
APPENDED, including the one a repointed denial leaves behind, which is the
state `ksor ingest` and `ksor serve` refuse as `ksor-takedown-unledgered` and
name this command as the remedy for. Without `--write` it prints a
unified diff and changes nothing. `--write-site` UPDATES every file of
`system/site` this release emits — the byte-copied rule modules, the site's
`next.config.mjs`, and its `package.json`, which is the only path by which a
dependency bump reaches a record already scaffolded. It never creates a site.
That manifest is MERGED rather than reissued: the entries ksor ships move to
this release's versions and anything the adopter added stays, because copying
it whole deleted their own dependencies (walked live, 2026-08-30). It refuses by name (`ksor-migrate-underivable`) rather
than author a title, a description, a `generated.at` or the actor behind a
takedown — and rather than DERIVE either of the two values a re-run can no
longer know: an audience, once the `audiences:` model it deleted is gone (it
writes `instance.md` last so an interrupted run keeps one), and a
`ksor.superseded_by` resolving to no concept, which `ksor build` would refuse as
`ksor-supersession-strands`. `workbench/example-corpus` is migrated and builds green;
`scripts/check-corpus.mjs` no longer applies the pre-profile rules to it.

**The kernel reads the record through it, and stores what it finds.** Schema
2.5 puts the profile on the row — `content_nodes.audience TEXT[]` with a GIN
index (the ranked `visibility` is mapped and dropped), the authored status
CHECKed onto `draft | stable | deprecated`, the OKF trust vocabulary as JSONB,
`effective_from`/`stale_after` and a derived `trust_tier`; the run carries
`build_id`, the policy as a row with its digest, and the ledger's id set; the
denylist row carries the ledger entry that wrote it and the one that revoked
it, and the `DENIED` seam denies only rows still in force. Existing databases
walk 2.4 → 2.5 (decision 16). `ksor ingest` runs `checkRecord`, refuses
without a fresh `build.lock.json` (`ksor-lock-missing` / `ksor-lock-stale`),
applies the ledger in file order, and records the `build_id` it published;
`GOVERNANCE_SINCE` is 2.5, so a carried-forward generation refuses to serve
until it is re-ingested. `ksor takedown` is ledger-first (record spec §5):
the entry, then the row, with `--revoke`, `--removed`, `--file-only` and
`--apply`, and `--export` and `.ksor-denylist.json` are gone. `--list` and
`--ledger` read without a database too, from the committed ledger — the rung
`ksor init` emits, and the only place `--revoke`'s entry id can be found there.
The write is serialised and APPEND-ONLY: the read, the decision and the write
happen under `.ksor/takedowns.yaml.lock` (a holder still there after 30s is
`ksor-ledger-locked`, exit `3`, nothing written), and the entry is appended
with `O_APPEND` rather than the file rewritten — so N concurrent runs record N
acts, and the ledger has no state in which it is shorter than it was. A file
that exists and holds nothing is `ksor-ledger-empty`, never "no denials".

**And serving now reads all of it.** `lib/lifecycle.ts` and `lib/trust.ts`
join the audience overlap in ONE admitted set (`lib/admit.ts`), bound beside
`DENY` in search's two arms, read, outline and the calibration sampler: a
draft, a document before its `effective_from`, one past its `stale_after` and
a deprecated one are absent from every machine surface (record spec §2.5),
and a caller may name a `min_trust_tier` the arm enforces before ranking. A
SECTION carries no governance of its own and is admitted iff an UNDENIED
descendant is visible, by a recursive `parent_id` walk — so a section whose
every document has been withdrawn leaves the outline instead of advertising
`child_count: 0`. `AUDIENCE_CASES` is the overlap
table and every row of it — sections and refusals included — runs through
real Postgres, as does every line of `LIFECYCLE_CASES`. A calibrated floor
carries the digest of the predicate it was measured under, and one measured
under another (or under none) enters the declared-but-uncalibrated refusal
rather than reading as `gate: off`. The snapshot token binds the viewer list.

**And the door says what it knows.** `search` accepts `min_trust_tier`
(`unverified` | `machine-confirmed` | `human-reviewed`), and
`KSOR_MIN_TRUST_TIER` sets the deployment's own floor; the two compose by one
rule — the higher of the pair — so configuration tightens and an argument
never loosens, asserted through real Postgres across every configuration.
The default and the enforcement live in the HANDLER, so a registration
scaffolded before the parameter existed keeps working and the boot inspection
NOTICES its absence instead of refusing it. Every hit carries its
`governance` — `status`, `trust_tier`, the latest `verified` act,
`effective_from`, `stale_after`, and `approval` with `checked: "policy"`,
which is honest absence in the envelope's own idiom: policy-checked, not yet
change-control-verified. `read` carries the same `governance` block, from the
same columns through the same seam, and returns the concept's frontmatter
byte-exact beside it (`sources.frontmatter`, the author's own bytes, never a
re-serialisation) — the frontmatter is what the author DECLARED and is
untrusted corpus text, `governance` is what the record stored, and the tool
description says which is which. The in-band injection advisory reads both.
Every serving act's `retrieval_log` row records the viewer list, the trust
floor that applied, whether it abstained and how many results it returned —
and never content or the query.

**And the site publishes the same record.** Staging runs for EVERY build — the
level-0 fast path that served `knowledge/` unstaged is gone, because no record
is safe to serve raw once every one of them has drafts, a ledger and generated
indexes. `KSOR_AUDIENCE` is a comma list validated against the lock's registry
and required to include `public`; admission is the overlap rule and the §2.5
lifecycle table, decided once at the lock's `as_of`. Each directory's
`index.md` is REGENERATED from the staged tree rather than the committed one
copied, so a public folder page cannot list an internal title, and `index.md`
is excluded from the docs collection. Denials come from `.ksor/takedowns.yaml`
in ledger order — the `.ksor-denylist.json` reader is gone, and a stray one
changes nothing. `llms.txt`, `llms-full.txt`, every `/md/` twin and
`/.well-known/mcp/server.json` carry `build_id`, `source_commit` and
`ksor_version`; the build refuses `ksor-lock-missing` / `ksor-lock-stale`
without a fresh lock outside development, and `ksor-site-outdated` when the
lock was written by a newer `ksor` than the site's rule modules carry. The
display title is `instance.md`'s `title:` key; there is no body H1 to read.

**What is NOT built, on this branch or anywhere** — phase B of
`research/okf-native.md` §4.2, none of it started:

- **`ksor build --bundles`** parses and exits `2` with the honest notice. One
  OKF bundle per registered audience, for exchange, is designed and unwritten.
- **Change-control verification of approvals and ledger actors** (KSP R22–R25
  against repository history). Until it exists an approval is POLICY-checked,
  and every envelope says so in its own idiom: `approval.checked: "policy"`.
  Whether an edit to a stable concept bumped `generated.at` is likewise
  unverified — the checker compares two authored instants and no more.
- **`llms.txt` v2 URL forms and path-scoped files.** The site emits the form
  it emitted before.
- **OKF import** (R26) — reading a foreign bundle INTO a record. Demand-gated:
  it needs a second ingest adapter and a verb, and nobody has asked yet.

The ranked audience rule is GONE. `decideVisible` and `RANKED_AUDIENCE_CASES`
were dead code asserted only against each other — and the suite doing the
asserting was the site's half of decision 18's decision table, so the site's
real staging rule (`overlaps`) had no conformance run against it at all. Both
are deleted; the site's half now runs the site's own copy of `overlaps`
against `AUDIENCE_CASES`.

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

### A record can raise its voice, and a reader can unwrap a line (released in 0.0.40)

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
window, so the record's owner decides what it says. Re-measured 2026-08-25
after the trust floor, the per-hit governance and the trust-tier provenance
sentences landed: the definitions are
**17,394 chars / ~4,349 tokens** as transmitted — exact, they depend on the
code alone — which is `search` 8,152 + `outline` 3,552 + `read` 5,686 =
**17,390**, plus the four characters the `tools` array itself carries;
the per-call figures were NOT re-measured against that record, and
`packages/ksor/docs/tool-surface.md` derives them from the 2026-08-23
measurement plus the governance block's exactly-measured 262 chars a hit. The
same block rides on every `read` reply, beside the authored frontmatter — and
both floors now say which of its fields were CHECKED (`approval`, against the
governance policy) and which were only derived from what the document declares
about itself (`trust_tier`).

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
  `research/visibility.md` and issue #10; **rewritten onto the KSoR Profile
  of OKF in the OKF-native change** — the contract is now
  `specs/ksor/record/spec.md` §2.4 and `specs/ksor/build/spec.md` §3) — the
  record declares its audience, and the model is now OVERLAP, not rank:
  `ksor.audience` is a non-empty LIST on every concept (omission is refused,
  never defaulted), the registry lives in `.ksor/governance.yaml`, and a
  viewer is a comma list in `KSOR_AUDIENCE` that must include `public`
  (`ksor-viewer-omits-public`, `ksor-viewer-unregistered`). A document is
  admitted when the two lists overlap. `visibility:` is a pre-profile key and
  is refused by name (`ksor-legacy-key`). Staging is UNCONDITIONAL — every
  build stages, there is no `audiences:` precondition and no level-0 fast
  path, because no record is safe to serve raw now that every one has drafts,
  a ledger and generated indexes. One shell (decision 9's 2026-08-24
  revision). What has not changed is what the staged build guarantees: no
  trace of a document outside the viewer (page, search, llms, sidebar, asset
  name or bytes — raw or base64), the filter never in the client bundle,
  non-public builds labelled, canary sweeps and positive controls in CI, and
  the two adversarial rounds' 16 findings closed by one canonical frontmatter
  grammar with every malformed shape failing closed.

- **Governance rendering on the site**
  (`specs/ksor/site-governance/spec.md`, issue #29; rewritten onto the KSoR
  Profile of OKF, `specs/ksor/record/spec.md` §2, in the OKF-native change) —
  the record carries a governance vocabulary on every concept and the site
  rendered none of it. Now each document's page shows what the record says
  about it and who said it: a **status chip on every page** (`draft` /
  `stable` / `deprecated` — including `stable`, because a reader who cannot
  see it cannot tell a governed record from a site that never said), the
  **trust tier** OKF names (`unverified` / `machine-confirmed` /
  `human-reviewed`) with the verification that set it, the **approver** and
  date that make a `stable` document stable, the **owner**, the **withdrawal**
  and date on a deprecated one, `Replaces` derived from the record in the
  other direction, `Effective from` / `Review by`, one entry per `sources`
  entry at the foot with a URL followable and a scope descriptor left as text,
  and — above the title, where it cannot be missed — a deprecation notice
  naming the successor and linking to its route. Where the calendar keeps an
  otherwise current document off the machine surfaces, a second chip carries
  record spec §2.5's own words: `effective from <date>` and `past its review
date`. The same badge marks the row in the sidebar, in every listing and in
  the search results, where the snippet would otherwise quote a withdrawn
  figure. Nothing is inferred — an undeclared key renders nothing, never a
  placeholder that would read as governed. All server-rendered, so it survives
  print, a failed bundle and JavaScript off (verified live in both themes).
  Publication is the owner's call: `site: governance: false` in instance.md
  leaves the pages plain while the record keeps every key for the agent surface
  and the audit trail — and it hides no CAVEAT: neither the deprecation notice
  nor the lifecycle badge, which the sidebar, the listings and the search
  results carry whatever the key says. The build refuses a value that is not
  `true`/`false`.
  The **agent files carry the same record**: `llms.txt`, `llms-full.txt`, every
  `/md/` twin and `/.well-known/mcp/server.json` carry the build's `build_id`,
  `source_commit` and `ksor_version`, and each twin serves the concept's own
  frontmatter INTACT — nested `ksor:` and all — under the derived `trust_tier`
  and those stamps, so an OKF consumer parses the profile's grammar rather than
  this shell's summary of it. A deprecated, not-yet-effective or stale concept
  is on none of those files at all (record spec §2.5), which is the profile's
  answer to the one-source-two-truths defect the caveat markers used to patch
  (`research/site-design.md` F1). `site: governance: false` is a decision about
  the PAGES and never reaches those files.
  Fumadocs shell only: bound there rather than as a surface-contract clause
  (owner, 2026-08-20), so a project that swaps shells loses it until its shell
  adds it. First released in 0.0.21, on the ranked model.

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
  themes. The seed quiz `ksor init` shipped until 0.0.44 (when the starter was
  trimmed to one companion, the summary) was itself refused on first draft for
  putting four of five answers at option B.

- **Study attachments — summaries and flashcard decks** (decision 24,
  `specs/ksor/study-attachments/spec.md`, released in 0.0.28). A
  document may carry `<doc>.summary.md` and `<doc>.flashcards.yaml` beside it.
  The summary joins the record's own words as a second TAB — the two readings
  of a document. The deck renders at the END of the page, in the region the quiz
  now shares, because a study aid is used after reading and a tab would hide
  the document while you used it. `ksor init` ships the summary on the seed
  document; the seed deck, quiz and slides were trimmed from the starter in
  0.0.44, so a flashcard deck is now something the owner adds. Presence-driven: a document with neither gets no tab strip and no
  region at all (verified live: a page without attachments renders zero
  `role="tab"` elements).

  An attachment is part of its document, not a document. Verified on the
  shipped bytes of a scaffold built from the packed CLI: **no route, no `/md/`
  twin, no `llms.txt` or `llms-full.txt` line, no search-index entry**, and the
  parent's own `/md/` and both llms files are **byte-identical** (sha-256) with
  and without attachments present. Governance inherits: with the parent's
  `ksor.audience` set to `[internal]` (measured before the profile landed, when
  the key was `visibility: internal`), a public build contains the summary and
  deck text in **0** files against a positive control of 26. `ksor ingest` creates no node
  for either, so neither is independently citable — previously `isDoc` accepted
  `x.summary.md` and gave it its own `stable_id`, which is the one cause behind
  four cross-surface leaks (decision 24). Since the profile landed a
  `<doc>.summary.md` carries exactly `type: Summary` and nothing else
  (decision 27): the class refusal became a one-key allow-list, because the
  bundle needs a marker to tell a companion from a concept. The other four
  kinds still declare nothing.

  Refusals carry remedies and fire in both `pnpm check` and `pnpm build`:
  `ksor-attachment-orphan` (an attachment whose document is missing) and
  `ksor-attachment-frontmatter` (a `<doc>.summary.md` whose frontmatter is
  anything but exactly `type: Summary`, absence included — the rule that closes
  `visibility:` widening, takedown escape, and claimed governance a non-node
  cannot carry). `.yml` is refused by name.

  Each document also reports how long it takes to read, counted at build
  time from its own markdown — so the figure is in the shipped HTML rather than
  measured in the browser after paint. Fenced code and frontmatter are excluded
  from the count. Where a summary exists both tabs carry their own figure.

  Scheduling is `ksor-sm2-v1`, a two-grade SM-2 variant — **not FSRS**, no
  retention target claimed, with what it gives up recorded beside the code. Its
  transition table is asserted for every state x rating pair against a frozen
  clock, and the ladder it produces is measured in the suite: 10 min, 2 d, 5 d,
  13 d, 33 d.

- **The content kernel and the MCP gateway** (decision 11; converted on the
  kernel-conversion branch and released in 0.0.8–0.0.18): four workspace packages — postgres (Postgres access
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
  current version (2.5); an existing one moves forward through
  `schema/migrations/<from>-<to>__<slug>.sql`, applied by a runner keyed on
  `schema_meta`. The chain is WALKED, not sorted, so a missing step refuses
  rather than being skipped, and each step commits with the `schema_meta` row
  that records it. `ksor schema --apply` compares versions instead of checking
  presence. This retires the "drop and recreate the database" remedy, which
  destroyed `retrieval_log` and `takedown_denylist` — the only two tables that
  cannot be rebuilt from markdown.

- **The governance boot gate — DONE.** `ksor serve` refuses the states the SITE
  already refuses to build in, because a door that serves where the site stops
  is the two surfaces reading different truths. Each generation is stamped with
  the schema it was built against, so a generation older than the governance it
  needs is detectable and refused rather than served at the widest tier — the
  floor is 2.5, the version that put the audience LIST on the node row. Since
  schema 2.5 the gate also refuses a denylist row that no ledger entry accounts
  for (`ksor-takedown-unledgered`) and REPORTS one whose entry the ingested
  ledger does not contain (`ksor-takedown-unmerged`: the verb wrote the row,
  the pull request never merged).

- **Subtree takedowns reach the site — DONE, then replaced.** The database
  export that carried a denial to the site is gone with `--export`: the ledger
  `.ksor/takedowns.yaml` is committed, so the site reads the denial from the
  repository and needs no database to ask. The finding the export existed for
  stands and is now structural — a document added under a withdrawn section
  after the last ingest is covered because the ledger names the section, not a
  list of ids the active generation happened to hold.

## Designed, not implemented

- `ksor dev` — **implemented** (dev spec §1): starts the local site with live
  governance checks and an MCP proxy to a running `ksor serve`. The scaffold's
  own `pnpm dev` still works without it, and `ksor dev` is the recommended
  local loop. `ksor serve`, `ksor ingest`, `ksor schema`, `ksor grant`,
  `ksor takedown`, `ksor calibrate` and `ksor gc` are implemented and released —
  the bundled kernel provides them from the one `ksor` binary. `serve` runs the
  MCP server in-process (reads `./instance.md`; exits `3` with a remedy when it
  is missing). `ksor build` and `ksor migrate` are both implemented and released
  (0.0.41); run outside a record they refuse with exit `1` and
  `error: ksor-instance-missing`, which is
  a real verb declining a real state. `ksor dev` is the one verb that still
  answers "designed but not implemented" with exit `2`. The two codes are a
  contract (product principle 4) — `2` says designed and coming, `1` says
  refused — so they are worth stating apart rather than together.
- `ksor build --bundles` — parses, prints the honest notice, exits `2`. It is
  phase B of `research/okf-native.md`, with `specs/ksor/build/spec.md` §1.4 as
  its contract: one OKF bundle per registered audience under
  `.ksor/out/bundles/<audience>/`, for exchange.
- Change-control verification (KSP R22–R25) against repository history, which
  is what would let an approval say `checked: "change-control"` instead of
  `checked: "policy"`, and what would verify that an edit to a stable concept
  bumped its `generated.at`. Phase B.
- `llms.txt` v2 URL forms and path-scoped files. Phase B.
- OKF import (R26) — reading a foreign bundle into a record. Demand-gated: a
  second ingest adapter plus a verb, when someone asks for it.
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
