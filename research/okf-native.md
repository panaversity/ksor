---
issue: https://github.com/panaversity/ksor/pull/161
status: accepted (phase A and B built)
last_updated: 2026-08-25
---

# OKF-native: making the record what the README already says it is

The README (lines 966–999) tells the public that the KSoR record **is** an OKF
bundle constrained by the KSoR Profile (KSP-001 draft 9, §4). The code does not
agree on any axis. A fact-map of the tree on 2026-08-24 (thirteen readers,
thirty-three citations spot-checked) found: five hand-rolled frontmatter
readers that cannot parse a single profile-shaped document and fail silently
on the `ksor:` block (`plain-tree.ts:475`, `instance.ts:113`); no serving path
that reads `doc_status`, so a `status: draft` document is searched and read
like an approved one (the kernel's only governance predicates are takedown and
`packages/content/src/lib/audience.ts:123`); `llms.txt` and the twins with no
build id, commit or tool version; a takedown ledger that lives only in
Postgres and is _exported_ to a gitignored file the site reads (the
DB→projection direction 4.1.4 forbids); and a calibration sampler that binds
no audience or lifecycle seam at all (`calibrate/run.ts:50-58`).

This record is the plan for closing that gap, written for the owner who asked
to see **what we are going to do and how it will work from today**: §1 is the
walk, §2 the decisions taken, §4 the work. **Phase A is built; §7 records
where the implementation diverged from what is written below, and the code
wins over every sentence here.** Phase B has not started, so §1.7 and the
change-control clauses describe intent rather than behaviour. The contracts are
`specs/ksor/record/spec.md` (Class A — the record) and
`specs/ksor/build/spec.md` (Class B — `ksor build`). Two adversarial review
rounds (98 and 68 confirmed findings) reshaped both; §6 records what they
changed so the reasoning is not lost.

**Business claim served:** "a system of record is where the official version
lives" — and "vendor-free is the ownership argument". A record that is
literally an open bundle, readable by any OKF consumer with no ksor in the
loop, is the strongest form of "what a customer owns is the source".

## Question

How can the KSoR record be aligned with the Open Knowledge Format (OKF) specification and the KSoR Profile, resolving discrepancies between the stated goal (KSoR is an OKF bundle) and the current code implementation, and what are the specific steps, architectural decisions, and costs involved in achieving this alignment across all serving surfaces?

## Evidence

As of 2026-08-24, a fact-map of the KSoR tree revealed significant discrepancies: five hand-rolled frontmatter readers failed silently on the `ksor:` block (`plain-tree.ts:475`, `instance.ts:113`); no serving path read `doc_status`, meaning a `status: draft` document was searchable and readable (the kernel's only governance predicates were takedown and `packages/content/src/lib/audience.ts:123`); `llms.txt` and its twins lacked build ID, commit, or tool version; the takedown ledger resided only in Postgres and was exported to a gitignored file, violating the forbidden DB→projection direction (4.1.4 forbids); and the calibration sampler bound no audience or lifecycle seam at all (`calibrate/run.ts:50-58`).

This document outlines the plan to close these gaps, with Phase A already built and its implementation diverging from the original written plan (where the code wins). Phase B is not yet started. The contracts are `specs/ksor/record/spec.md` (Class A) and `specs/ksor/build/spec.md` (Class B). Two adversarial review rounds (98 and 68 confirmed findings) reshaped both specifications.

**Business claim served:** "a system of record is where the official version lives" and "vendor-free is the ownership argument." A record that is literally an open bundle, readable by any OKF consumer with no `ksor` in the loop, is the strongest form of "what a customer owns is the source."

## Decision

To bridge the gap between the KSoR README's claim (KSoR record _is_ an OKF bundle) and the actual code, the organization has decided to implement a comprehensive alignment plan, with Phase A already built and its implementation taking precedence over the original written plan where divergences occurred. Phase B is pending. This involves establishing the KSoR record as an OKF bundle, constrained by the KSoR Profile, and ensuring all projections (human site, AI discovery, agent surface, exchange) adhere to a single governance boundary and derive from this authoritative record. Crucially, where the implementation diverged from the written plan, **the code wins over every sentence in the plan** (§7).

Key decisions made or refined during this process include:

1.  **Conformance Floor**: Replaced the numeric ladder with a conformance floor, explicitly defining required frontmatter fields (`type`, `title`, `description`, `status`, `ksor.audience`) and a policy for approval/takedown actors. `Document` is designated as a non-reserved type for documents requiring minimal governance. (Revises decision 7, product principle 7).
2.  **Audience Model**: `ksor.audience` is a required list with overlap semantics, and its omission now results in a failure. This explicitly reverses the previous "never a list" clause in the visibility spec, supported by `AUDIENCE_CASES` table assertions across Postgres and the site. (Revises decisions 15, 18, 19 and the visibility spec).
3.  **Draft Lifecycle**: Drafts are confined to the `pnpm dev` preview environment for review. All `build` operations (human pages, sidebar, search index, machine artifacts) explicitly exclude them, as per R13. (`KSOR_DRAFTS=show` can admit drafts to human surfaces only, marking the build `noindex`). (Revises decision 7, decision 19).
4.  **`index.md` Generation**: `index.md` files are _generated_ at build time, committed, and drift-checked; they are not authored and are never copied directly into a stage. Section prose is now converted into distinct concept documents. Projections regenerate their indexes from filtered trees. (Revises decisions 14, 24).
5.  **Companion Files**: `x.summary.md` files now exclusively contain `type: Summary` and are designated as a companion marker, not a concept type, thus enforcing the no-independent-id guarantee. (Decision 24's no-independent-id clause remains unchanged).
6.  **Instance Document and Governance Policy**: `instance.md` is defined as a profile-shaped document residing _beside_ the bundle, not within it, and it does not carry `status` or `ksor.audience`. Core authority is centralized in `.ksor/governance.yaml`. Both the policy and takedown ledger are _ingested_ into the database to ensure runtime binding to rows rather than files. (Revises decision 8, product principle 3).
7.  **Takedowns as Append-Only Ledger**: Takedown actions are recorded as entries in an append-only, committed ledger (`.ksor/takedowns.yaml`) and are applied immediately by the `ksor takedown` verb. Revocation involves appending a new entry that sets `revoked_at` on the target. `ksor build` now refuses a ledger that shrinks, and the checker validates all entries against defined `takedown_authorities`. (Revises decision 14, 21).
8.  **Real YAML Parsing**: The `yaml` package is now integrated into the kernel and scaffold site. The `check.mjs` is _built_ from the kernel's checker and index generator, ensuring a single, bundled rule set with its parser in all skill copies for adopter CI. (Revises decisions 10, 12, 18).
9.  **`ksor build` Scope**: `ksor build` is a database-free operation that performs checks before writing. It distinguishes `build_id` (lock identifier) from `generation` (kernel's citation counter). `as_of` defaults to now to manage staleness, ensuring a scheduled rebuild is an operator's obligation. (Revises product invariant, decision 11).
10. **Time Standard**: All timestamps now adhere to ISO 8601 instant with explicit UTC offset, aligning with upstream OKF v0.2. KSP-001 re-pins to a specific OKF commit SHA for semantic stability. (Re-pins KSP-001 to specific OKF commit).
11. **`sor_id` Retirement**: `sor_id` is retired by owner decision. The `path-as-identity` model, while weakening immunity to reorganization, is compensated by `ksor-takedown-dangling` refusals for renamed denied documents. (Revises decision 14).
12. **`ksor migrate --write`**: Confirmed as the primary update vehicle for the record and adopter-owned site, resulting in `minor` changeset bumps. The `takedown --export` mode is removed. (Revises decision 4).
13. **Stable Requires Approval, Not Verification**: Stable concepts now require `ksor.approval`, but not `verified`, decoupling verification from publication and preventing manufactured verifications (a draft-10 correction to KSP 4.2.2.3). A stable, approved, unverified concept is considered an honest state.
14. **Footnotes as Extension**: GFM footnotes (reference and definition) are designated as the sole CommonMark extension in `knowledge/`, aligned with OKF's per-claim citation. (Revises decision 8).
15. **Phase A Release**: KSP-001 draft 10 lands with Phase A, incorporating numerous corrections and revisions based on implementation experience, as detailed in §2.15 of this document.

## Rejected

- **Hand-rolled frontmatter readers**: Rejected in favor of robust, profile-aware parsing that understands the `ksor:` block and other profile-specific fields. (`plain-tree.ts:475`, `instance.ts:113` initially failed silently).
- **Serving `doc_status` for drafts**: Rejected. `status: draft` documents are explicitly excluded from serving paths to prevent them from being searched and read like approved content. (Kernel's governance predicates were only takedown and audience).
- **`llms.txt` and twins without build metadata**: Rejected. They now carry build ID, commit, and tool version (R14).
- **DB→projection direction for takedown ledger**: Rejected. The takedown ledger is _ingested_ from a committed file into Postgres, reversing the forbidden DB→projection direction (4.1.4).
- **Calibration sampler binding no audience or lifecycle seam**: Rejected. The calibration sampler now binds audience and lifecycle seams (`calibrate/run.ts:50-58`).
- **Authoring `index.md` files**: Rejected. `index.md` files are generated, not authored, to prevent ungoverned knowledge on served surfaces (R4).
- **Copying committed `index.md` files into a stage**: Rejected. Projections regenerate their indexes from filtered trees to avoid R5 visibility leaks.
- **Treating `Summary` as a concept type**: Rejected. `Summary` is a companion marker, not a concept type, and carries only `type: Summary`.
- **`instance.md` as a concept**: Rejected. It is a profile-shaped document beside the bundle, not subject to lifecycle or audience governance.
- **Multiple homes for audiences (e.g., in `instance.md` and policy)**: Rejected. Authority lives in `.ksor/governance.yaml` to avoid decision 18's failure mode.
- **Soft deletion of takedown ledger entries**: Rejected. The ledger is append-only; revocation is a new entry setting `revoked_at`, never a deleted line.
- **Allowing shrinking takedown ledgers**: Rejected. `ksor build` refuses a ledger that shrank against its git history.
- **Unauthorised ledger entries**: Rejected. The checker validates every entry whose actor the policy does not name.
- **Publishing an embargoed policy early**: Rejected. The `CLOSED ksor:` block (including hyphenated `ksor.effective-from`) now fails closed to prevent this.
- **Remedy to delete `stale_after:`**: Rejected. No refusal prints a delete for `stale_after` any more, as it could publish a withdrawn document.
- **One-shot transcription of denylist for `ksor migrate`**: Rejected due to contradictions with re-pointed entries. Migrate now records the row as it stands, appending to an existing ledger any row not accounted for.
- **Deleting `instance.md` `audiences:` model during `migrate`**: Rejected. Losing the model is a refusal; `instance.md` is written last to ensure re-runnability.
- **`superseded_by` refusals missing `no concept at all` case**: Rejected. `ksor build` now refuses this as `ksor-supersession-strands` after migrate has written it.
- **Migrating `.mdx` files with `ksor migrate`**: Rejected. `loadRecord` only reads `.md` and `.yaml`; `.mdx` files are refused by the record checker and must be moved manually by the adopter.
- **`sor_id` for node scope**: Retired (owner decision), as path-as-identity weakens it and causes new IDs on rename.
- **`verified` on every stable concept (KSP 4.2.2.3)**: Rejected. This profile drops it to decouple verification from publication, preventing manufactured verifications (draft-10 correction).

## Reversal

- **Visibility Spec's "never a list" clause**: This rule was _reversed_ to allow audience to be a required list with overlap semantics, based on evidence from `AUDIENCE_CASES` table assertions proving that a wrong intersection failed. (Revises decisions 15, 18, 19 and the visibility spec).
- **`index.summary.md` as a reserved type for `Summary`**: Decision 24's `index.summary.md` row (related to `index.md`) was revised. The understanding of `Summary` as a reserved type was refined to `Summary` being a _companion marker_ outside the concept type system, which is a reversal of its conceptual placement. (Revises decision 24).
- **`generated.at` after `approval.at`**: R23 states that a stable concept _must_ update `generated.at` and either renew `ksor.approval` or set `status: draft` if altered. If the mechanical check that fails a stable concept when `generated.at` postdates `ksor.approval.at` is _ever allowed to pass_ (e.g., by owner decision), it would be a reversal of this core governance rule.
- **`sor_id` as immutable node identifier**: `sor_id` is retired by owner decision. This is a reversal of decision 14's premise that node scope is "immune to reorganization" and means that a renamed denied document gets a new ID, requiring compensating controls (`ksor-takedown-dangling`).
- **Coupling verification to publication**: The previous requirement in KSP 4.2.2.3 for `verified` on every stable concept was dropped. This is a reversal of that coupling, based on the evidence that it led to manufactured verifications and R17 violations. The new stance is that a stable, approved, unverified concept is an honest state. (Draft-10 correction).
- **Initial plan for ledger baseline**: The original plan for the ledger baseline (only IDs) was _reversed_ to `(id, digest)` pairs due to a discovered `ksor-ledger-amended` bug where ID retargeting could republish denied documents. This changed the fundamental representation of ledger entries.
- **Site lock freshness scope**: The initial plan for site lock freshness covering only documents was _reversed_ to include control files and assets (e.g., `instance_sha256`, `policy_sha256`, `ledger_sha256`, `assets[]`) after a takedown was lifted and diagrams were replaced without refusal.
- **Asset audience inheritance**: The original plan for asset audience inheritance (asking only the asset's own directory) was _reversed_ to ask the _nearest ancestor directory_ that holds any concept, after a nesting bug was discovered.
- **`ksor.effective-from` with hyphen**: The plan did not anticipate this. The implementation of a `CLOSED ksor:` block that refuses keys with hyphens effectively reverses an implicit allowance for such malformed keys.
- **Migrate deleting `instance.md` `audiences:` model**: This was a documented behavior in the plan for `ksor migrate`. Its _reversal_ in the code (where losing the model is now a refusal, and `instance.md` is written last) indicates a change in the migration strategy to prioritize data integrity.
- **`superseded_by` refusals**: The plan's `superseded_by` refusals initially covered only a pointer climbing out of `knowledge/` and one on a document not being deprecated. The addition of a refusal for a pointer that resolves to _no concept at all_ (`ksor-supersession-strands`) is a reversal of an implicit allowance for such an invalid state.
- **`takedown --export` removal**: The `takedown --export` mode was removed. This is a clear reversal of its existence and constitutes a pre-1.0 API commitment.
- **The profile being wrong or silent about OKF in places**: The numerous corrections in draft 10, where the profile was updated to reflect `code wins` against OKF, represent reversals of previous understandings or omissions in the profile.

## 1 · From today: the walk

### 1.1 A new record, day one

```
npx @panaversity/ksor init acme
```

The tree that appears (root set unchanged except one new member, `.ksor/`):

```
acme/
  instance.md                 title, description, name, toolchain stamp,
                              deployment keys; body = the MCP instructions
  .ksor/governance.yaml       who has authority — five lines at level 0
  .gitignore                  `.ksor/*` with the two ledgers un-ignored
  knowledge/
    index.md                  GENERATED (okf_version: "0.2") — never edited
    what-is-a-ksor.md         type: Document · status: draft
    what-is-a-ksor.summary.md   ---\ntype: Summary\n---  then the summary
    what-is-a-ksor.{flashcards,quiz,slides}.yaml   unchanged
    governance-ladder.md      type: Document · status: draft
    surfaces/
      index.md                GENERATED
      overview.md             the prose that used to be surfaces/index.md
      for-people.md · for-agents.md
  system/ …                   unchanged
```

Every one of the five starter documents is `type: Document` — the profile's
named non-reserved type, which asks for no owner and no sources (the level-0
escape) — and `status: draft`. Draft is forced, not chosen: R25 forbids a
tool recording a `human:` approval for an act no human performed. Each
carries `generated: { by: ksor-starter/<version>, at: <template date> }` —
the producer/version form, fixed bytes, and true. The policy:

```yaml
version: "0.1"
approval_authorities:
  - actors: [human:you] # the intake interview fills this in
takedown_authorities:
  actors: [human:you]
```

No `audiences:` — `public` is reserved and implicit until a restricted tier
exists. No `ownership:` until the owner wants review bound to owners.

```
pnpm dev
```

The preview shows five documents, each with a `draft` chip; `llms.txt` and
the `/md/` twins show none. A **build** would show none anywhere: drafts live
in the preview, which is the review surface (decision 7), and in nothing a
deployment publishes. That lasts exactly one conversational turn:

> **Agent:** The intake interview is done. Five starter documents are drafts.
> Approve them? I will record `ksor.approval: { by: human:you, at: … }` and
> set `status: stable`. They will be stable at trust tier _unverified_ until
> someone records a review.
> **Owner:** yes

Now every surface lists five stable documents, the twins exist, the chips say
`stable` with approver and date, and the badge says _unverified_ — which is
true, and is the state OKF's own tiers exist to name. The approval was
performed by the human and recorded by the agent, which is what R25 permits;
no verification was invented, which is what R17 forbids.

### 1.2 Writing knowledge

The agent writes a document the way it does now, in a new shape:

```yaml
---
type: Policy
title: Purchase approval
description: Who may approve a purchase, at which thresholds.
status: draft
order: 2
generated: { by: "claude-code/1.0", at: 2026-08-25T09:00:00Z }
sources:
  - { id: fin-2024, resource: https://…/finance-handbook-2024.pdf, title: Finance handbook 2024 }
ksor:
  audience: [public]
  owner: team:finance
---

A purchase above 10,000 needs a director's signature. [^fin-2024]

[^fin-2024]: Finance handbook 2024, §3.
```

`pnpm check` refuses what the profile refuses, one line each with the fix
(the full slug list is record spec §6): a missing floor key; a status outside
`draft | stable | deprecated`; an audience not in the registry; a `stable`
document with no `generated`, no approval, an approval by an actor the policy
does not authorise, or a `generated.at` after `approval.at` (R23); a
`deprecated` document with no `ksor.deprecated` or one by an actor who is
neither the owner the POLICY resolves (never the document's own `ksor.owner`)
nor a takedown authority; a reserved type with no `sources`
or no `ksor.owner`; a source with no `resource`; a footnote reference or
definition whose label matches no `sources[].id`; `team:` as a verifier,
generator, approver or deprecator; an authored `index.md`, `log.md` or
`README.md`; a stale generated index; an attachment carrying any key but
`type: Summary`; a link, a supersession pointer, or a companion body reaching
a concept not every reader of the source may see; a ledger entry by an actor
the policy does not name, one naming a concept that no longer exists, or a
ledger that shrank.

To publish it: a reviewer with approval authority says so, the agent records
`ksor.approval`, sets `status: stable`, and the change goes through the pull
request the record already uses. The checker refuses a stable document whose
`generated.at` postdates its approval; whether an edit updated `generated.at`
is the author's obligation until change-control verification lands (§4.2),
and that is recorded as a cost (§5). A reviewer who actually checks the
content records `verified: [{ by: human:kim, at: … }]` as a separate act,
and the tier becomes _human-reviewed_.

### 1.3 A restricted document

```yaml
# .ksor/governance.yaml
audiences:
  internal:
    description: Employees
```

```yaml
ksor:
  audience: [internal]
```

Nothing else changes — including that document's links to public pages,
which pass: a link is safe when its target is public or readable by every
reader of the source. The public build never contains the document — not
its body, title, route, sidebar entry, search entry, index bullet, `llms.txt`
line or twin (R5) — and the internal build (`KSOR_AUDIENCE=public,internal`,
a comma list validated against the registry and required to include
`public`) contains it beside the public documents. A viewer holds a list; a
document holds a list; the document is visible when the two overlap. Rank
moves to the viewer, membership stays on the document — the sentence that
lets every row of `AUDIENCE_CASES` keep its meaning while the document stops
carrying a single ordered tier. The visibility spec's "never a list" clause
is **reversed** by this, and §2.2 says why.

### 1.4 Publishing

```
pnpm build        # = ksor build && the site build
```

`ksor build` needs no database. It generates every `index.md` in memory,
runs the check, and only then writes — the indexes whose bytes changed and
`build.lock.json`: a content-derived `build_id` over every input a projection
reads plus the set each canonical viewer admits at `as_of`, the last commit
that touched an input (not HEAD, so committing the lock does not move it; a
`dirty` flag when the tree differs from it), and `as_of` (now, or `--as-of`
to pin a release). The site build stages one tree for the configured viewer
list — copying admitted concepts and companions, **regenerating** each
directory's index from the staged tree rather than copying the committed
one — and stamps `llms.txt`, `llms-full.txt`, every `/md/` twin and
`/.well-known/mcp/server.json` with `build_id`, commit and version (R14).
Every build excludes drafts from every surface; a not-yet-effective or stale
stable document and a `deprecated` one render for people with a badge and
stay out of the machine artefacts (the table in record spec §2.5).

### 1.5 Taking something down

```
ksor takedown --actor human:ciso knowledge/policies/old-threshold --reason "superseded figure"
```

The verb refuses an actor `takedown_authorities` does not name. It appends an
entry to `.ksor/takedowns.yaml` — a committed, append-only ledger — and, when
the record declares a database and the DSN is present, writes the denylist
row in the same act so the door refuses now rather than at the next ingest.
The site reads the ledger; a level-0 record with no database gets takedown
for the first time. Lifting a denial is a new entry that names the one it
revokes, never a deleted line; deleting a denied file is an amendment entry
plus the deletion in one change; `ksor build` refuses a ledger that shrank
against its history, and the checker refuses any entry whose actor the policy
does not name, so a line hand-appended in a pull request is refused exactly
as the verb would refuse it. Direction is file → database, always; the
`export-denylist` step, `.ksor-denylist.json` and `takedown --export` are
deleted.

### 1.6 Serving

`pnpm provision`, `pnpm refresh`, `pnpm serve` — unchanged commands. What
changes underneath: ingest runs the same checker `ksor build` runs, refuses
without a fresh lock, reads the same frontmatter module, stores audience
lists, lifecycle, trust and effectivity as columns, stamps the run with
`build_id`, the policy (registry and authorities, as a row) and the ledger's
id set, and applies ledger entries in order. Retrieval evaluates one
predicate set before ranking in every arm and in the calibration sampler
(`lib/lifecycle.ts` is its single home; sections bypass it and are admitted
to an outline iff a descendant is visible):

```
DENY ∧ n.status = 'published' ∧ n.audience && :viewer
     ∧ n.doc_status = 'stable' ∧ n.effective_from <= now()
     ∧ (n.stale_after IS NULL OR n.stale_after > now()) ∧ n.trust_tier >= :floor
```

The door evaluates at request time; the site at the lock's `as_of`; the two
can disagree on a document that crosses a boundary between a build and a
request, which is disclosed and pinned by a decision-table row. `search`
accepts `min_trust_tier` (default `unverified`); every hit carries `status`,
`trust_tier`, `verified`, `stale_after`, its approval with `checked: policy`
(change-control verification arrives in §4.2, and the envelope says which it
is — honest absence, like `gate: off`); `read` returns the frontmatter
intact; the snapshot token binds the viewer's audience list. Calibration
binds the widest viewer list (every registered audience), lifecycle at now
and tier ≥ unverified, and records the digest of that predicate beside the
floor; when the serving predicate differs, the door boots in the
**uncalibrated refusal** — every search refuses `ksor-uncalibrated`, naming
the change and `ksor calibrate` as the fix — because a declared floor that
no longer matches its measurement is a declared-but-uncalibrated floor, and
the invariant says that refuses. **Every adopter with a numeric floor
re-measures.**

### 1.7 Exchange — PHASE B, not built

`ksor build --bundles` parses its flag and exits `2` with the honest notice.
What it will do:

```
ksor build --bundles
```

One OKF bundle per registered audience plus `public`, under
`.ksor/out/bundles/<audience>/`, built for the viewer list `[public,
<audience>]` exactly: the admitted concepts, companions beside their parents,
indexes generated for the filtered tree, `okf_version` at the root. Any OKF
consumer reads it with no ksor in the loop. Import stays demand-gated.

### 1.8 An existing record

```
ksor migrate --actor human:<you>                                  # shows the diff
ksor migrate --write --actor human:<you> --approve-by human:<you> # applies it
```

Mechanical, and honest about what it cannot know. It rewrites: `visibility`
→ `ksor.audience`, **expanding a tier to every tier at or above it** in the
old ordered model (`internal` under `[public, internal, board]` becomes
`[internal, board]`, printed in the diff — a one-element list would silently
drop the document from the board build); absent `visibility` →
`[default_visibility …]` when the instance declares a model, else
`[public]`; `owner` → `ksor.owner`; `provenance` → `sources` (each string
becomes `{ id: <slug>, title: <string>, resource: <string> }` — OKF permits a
scope descriptor as `resource`, and the author replaces it with a URL when
one exists); `effective` → `ksor.effective_from` at midnight UTC; `review` →
`draft`; `superseded` → `deprecated` + `ksor.superseded_by` +
`ksor.deprecated` by the migrating human (`--actor`, R25-honest);
`type: Document`; `generated: { by: ksor-migrate/<version>, at: <last commit
touching the file> }` (outside a repository, refused unless
`--generated-at`); every `<doc>.summary.md` without frontmatter gains
`type: Summary`; the instance's H1 into `title:`, `audiences:` into the
policy, the stamp into `toolchain:`, `format: 2`; every `<dir>/index.md`
or `README.md` with prose into `overview.md`, with `<dir>/index`
and `<dir>/README` denylist rows re-pointed (`node` → `<dir>/overview`,
`subtree` → `<dir>#section`); every existing denylist row into the ledger,
with the actor from the latest `takedown_applied` log row, or from
`--attribute <stable_id>=<actor>` (a human asserting it, recorded in the
entry's `reason`), refusing by name otherwise; and the site's byte-copied
rule modules offered as diffs (`--write-site`). (`index.mdx` was in this list
and is not: `loadRecord` reads `.md` and `.yaml` as text and nothing else, so an
`.mdx` never reaches migrate, and the record checker refuses one under
`knowledge/` by name — `ksor-file-type`, the bundle is CommonMark, decision 8.
An adopter carrying one moves it by hand, and the checker says so.) It DELETES `id:` and `name:`,
which only ever restated the path the profile makes the identity. It refuses,
by name, a document whose `title` or `description` it cannot derive — migrate
never authors knowledge — a `sor_id:` (retiring it changes the document's
stable id, so any takedown or citation keyed on the old one has to be
re-denied against the new one first), a `superseded_by:` that climbs out of
`knowledge/` (writing `null` there handed the checker frontmatter migrate had
invented) or that sits on a document it is not deprecating (the checker
refuses that tree as `ksor-supersession-strands`, and migrate knows it
first), and a denylist row whose `scope` is neither `node` nor `subtree` or
whose subtree entry names a document rather than a container. **`approved` becomes `draft`** unless the human running it
passes `--approve-by human:<id>`, in which case every previously `approved`
document becomes `stable` with that approval, because they performed the
act. **The flag belongs in the runbook**, because leaving it off is not a
smaller migration but a stopped one: every document lands as a `draft`, drafts
reach no machine surface, and the next `ksor build` reports `0 admitted to a
machine surface` at exit 0 — or, where one document supersedes another,
refuses with `ksor-supersession-strands` because the successor is now a
draft. The upgrade runbook, in order: upgrade the CLI → `ksor schema --apply`
(2.4→2.5 maps carried rows `approved`→`stable`, `review`→`draft`,
`superseded`→`deprecated`, sets `audience = ARRAY[visibility]`, and raises
`GOVERNANCE_SINCE` so a pre-2.5 generation refuses to serve until
re-ingested) → `ksor migrate --write --actor human:<you> --approve-by
human:<you>` → commit → `ksor ingest` (attaches
ledger ids to pre-existing rows by `stable_id`) → restart `serve`. The door
refuses unledgered rows between the schema step and the ingest, which is the
outage window §5 lists.

## 2 · The decisions taken (assumptions the owner can reverse)

Each is recorded with what would reverse it. _They became AGENTS.md **decision
27**, not 26: the YAML parser was split out and recorded first, as decision 26,
because it landed before the design it serves and a dependency needs its own
entry. Decision 27 carries the fifteen clauses below; decisions 10, 12 and 18
took their revision notes from 26, and 4, 7, 8, 11, 14, 15, 19, 21, 23, 24 plus
product principles 3 and 7 from 27._

1.  **The conformance floor replaces the numeric ladder.** Level 0 was `title`
    - `status`; the floor is `type`, `title`, `description`, `status`,
      `ksor.audience`, and a policy naming approval and takedown actors. The
      escape for a record that wants no owners or sources is a **non-reserved
      type**; the profile names one, `Document`, and promises never to reserve
      it. "The ladder" now means §7's trust rungs. Revises decision 7, product
      principle 7, the vocabulary row `level`. Reversed if a real adopter cannot
      reach the floor.
2.  **Audience is a required list with overlap semantics; omission fails.** No
    default, because the visibility leak recurred four times when a default
    lived in someone's head (decision 18). The visibility spec's "one value,
    never a list — set intersection is where access-control bugs live" is
    reversed with the evidence that answers it: the decision table
    (`AUDIENCE_CASES`) now asserts overlap through real Postgres and against
    the site's copy, so a wrong intersection fails on the row it broke. Rules:
    unset `KSOR_AUDIENCE` is `[public]`; a viewer list is a comma list
    validated against the registry and must include `public`; a bundle for
    audience X is the viewer list `[public, X]` exactly; a link is safe when
    its target is public or its target's list contains the source's. Rows 8–11
    and 15–16 of the table, which encode omission, become refusals. Revises
    decisions 15, 18, 19 and the visibility spec. Not reversible without an
    owner decision — it is the leak guarantee.
3.  **Drafts live in the preview; builds exclude them from every surface.**
    `pnpm dev` is the review surface (decision 7) and shows drafts marked;
    every build — human pages, sidebar, search index, machine artefacts —
    excludes them, because a static site's search index and sidebar are
    open-web machine artefacts too (R13). `KSOR_DRAFTS=show` admits drafts to
    human surfaces only, is recorded in the lock and the id, and marks the
    build `noindex`. Every other status is admitted per surface by one table
    (record spec §2.5), so both surfaces refuse the same states (decision 19).
4.  **`index.md` is generated, committed and drift-checked; nothing is
    authored in it — and it is never copied into a stage.** It carries no
    frontmatter, so it can carry no governance: anything written there is
    ungoverned knowledge on a served surface (R4). Section prose becomes a
    concept inside the folder. The committed index is the record's own map
    (every status, every audience — anyone with the repository has the files
    anyway); every projection regenerates its index from the tree it was
    filtered to, so a public folder page cannot list an internal title; the
    site's docs collection excludes it; it is never a link source for the
    widening rule. Ingest creates no node from it; every directory is the
    `#section` shell. Revises decisions 14 (section id) and 24 (the
    `index.summary.md` row). Reversed to export-only if committed generated
    files prove a review burden.
5.  **`x.summary.md` carries exactly `type: Summary`** and nothing else, and
    `Summary` is a companion marker outside the concept type system, not a
    reserved type. A one-key allow-list closes the same three leaks decision
    24's class refusal closed; ingest still creates no node; the widening rule
    evaluates a companion's body with its parent's audience. Under bare OKF a
    summary is a concept; the no-independent-id guarantee is a profile rule,
    stated as such in draft 10. Decision 24's no-independent-id clause is
    untouched.
6.  **`instance.md` is a profile-shaped document beside the bundle, not a
    concept; authority lives in `.ksor/governance.yaml`.** It carries
    `format: 2`, `name` (the one sanctioned identity key), `title`,
    `description`, `toolchain: { requires, scaffolded }` and the deployment
    keys; no `status` or `ksor.audience` — identity is not knowledge, and the
    lifecycle table does not apply to it. `audiences:` / `default_visibility:`
    leave it (two homes for audiences is decision 18's failure mode). The
    bundle root is `knowledge/`; the profile's §2.2 is corrected. The scaffold
    `.gitignore` becomes `.ksor/*` with the two ledgers un-ignored (the
    `.env.example` pattern; the directory form cannot be negated, verified).
    Policy and ledger are **ingested** — registry, authorities, entry set,
    digests — so the door binds to rows, not to files the container does not
    carry. Revises decision 8 (root set, gitignore) and product principle 3
    (`name` on the instance).
7.  **Takedowns are an append-only committed ledger the verb also applies
    immediately.** File first, row second, in one act; a revocation is a new
    entry that sets `revoked_at` on the row it names (the `DENIED` seam denies
    only unrevoked rows, so a lift is a column, not a delete); deleting a
    denied file is an amendment entry marking it `removed`, after which its
    reappearance refuses; every entry's actor is validated against
    `takedown_authorities` by the checker, the build and ingest, not only by
    the verb, because a committed YAML file is something anyone with write
    access can append to; `ksor build` refuses a ledger that shrank against
    its git history and the committed lock's id set, refusing outright when
    history is unavailable; ingest applies entries in order and never deletes
    a row; the boot gate refuses a row with no ledger id and reports one
    whose entry was never merged. The window between the verb and the merge
    is the pull request's review time, disclosed: the door refuses at once,
    the site follows the merged ledger at its next build — the latency it has
    today. Revises decision 14 (`sor_id`, see §2.11; and a denial may now be
    marked `removed`), decision 21 (a policy allowlist is authorisation, not
    the verification it asked for) and the grant spec (the verb, not the
    ingest role, is the takedown actor).
8.  **Real YAML.** The `yaml` package (zero dependencies, ISC) in the kernel
    and declared by the scaffold site; the emitted `check.mjs` is **built**
    from the kernel's checker and index generator by a second tsdown entry at
    package-build time — one rule set, bundled self-contained with the parser
    and its ISC notice, into both skill copies, gitignored in the templates
    like `schema/` — so adopter CI still runs with no install. Revises
    decisions 10 (the emitted checker carries a third-party notice), 12 (the
    dependency list) and 18 (the copy is generated, not hand-kept).
9.  **`ksor build` is in scope, database-free, and checks before it writes.**
    Two identities named apart and never confused in prose: `build_id` (the
    lock; what R14 stamps) and `generation` (the kernel's counter a citation
    pins). `as_of` defaults to now, so staleness leaves the open web on the
    next build and a scheduled rebuild is the operator's obligation; the
    reproducibility invariant's wording becomes "same tree + same toolchain +
    same `as_of` ⇒ same lock". Draft 10 renames the profile's "Generation" to
    "Publication". Revises the product invariant and decision 11's clause
    list (database-free init now includes `ksor build`).
10. **Time is an ISO 8601 instant with offset, everywhere.** Upstream OKF made
    the same move under the unchanged "0.2" label (#323, 2026-08-21). KSP-001
    re-pins to `GoogleCloudPlatform/open-knowledge-format` `SPEC.md` at
    `ad30107c31c06aec8a7d5636e0d1058118604e6f` (sha256
    `26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101`),
    vendored at `specs/ksor/record/okf-SPEC.md`, because the current pin
    resolves only in a repository that now disowns the copy.
11. **`sor_id` is retired — an OWNER decision, flagged.** Decision 14's node
    scope was "immune to reorganization" and is marked not reversible without
    an owner decision; path-as-identity weakens it: a renamed denied document
    gets a new id. The compensating control is `ksor-takedown-dangling` — an
    in-force ledger entry naming a concept that no longer exists refuses the
    build — so a rename goes red on both surfaces instead of republishing.
12. **`ksor migrate --write`** is the update vehicle decision 4 promised, for
    the record and (as diffs, `--write-site`) for the adopter-owned site;
    changeset **minor**; `takedown --export` removal recorded as a break.
13. **Stable needs approval, not verification.** KSP 4.2.2.3 requires
    `verified` on every stable concept; this profile drops it (draft-10
    correction), because coupling verification to publication manufactures
    the event R17 says must never be derived from approval — an author with
    an approver but no reviewer would write one. A stable, approved,
    unverified concept is the honest state, and it is what tier _unverified_
    is for.
14. **Footnotes are the one extension.** `knowledge/` is CommonMark plus GFM
    footnotes — reference and definition — the grammar OKF's per-claim
    citation uses; a footnote degrades to readable text in a pure CommonMark
    renderer. Revises decision 8's "CommonMark only".
15. **KSP-001 draft 10 lands with phase A.** Corrections: executor/attester
    are not OKF-required (only `runtime` is); `generated.at` is required by
    the profile, not OKF, so R23 has no undefined branch; the bare `verified`
    mapping a consumer MUST accept; "release revision" → "commit"; Class B
    "MUST fail" against OKF §11 "consumers MUST NOT reject" — profile
    validation of one's own record is not OKF consumption; `verified` dropped
    from the stable floor; `ksor.deprecated` carries R23's deprecation
    authority; the bundle root is `knowledge/` with `instance.md` and `.ksor/`
    beside it and the instance document outside the bundle; the root index
    takes its heading, not a summary, from the instance; `audiences` and
    `ownership` optional in the policy; `Document` named and never reserved;
    `Summary` a companion marker; `README.md` reserved by the profile; the
    committed index is the record's map and discovery indexes are filtered
    projections; subdirectory bullets carry no description; `ksor.superseded_by`
    and top-level `order` as named extensions; instants everywhere;
    "Generation" → "Publication"; the repository re-pin with path and hash.

**Checked against the OKF v0.2 announcement** (Google Cloud blog, 2026-07-25,
"OKF v0.2 adds trust signals"): nothing above contradicts it. "Tiers are
advisory signals, not access control" is §2.2's audience model; `verified`
naming "a nightly finance process, or both" is why process actors are
first-class in §2.3 of the record spec; "v0.2 adds vocabulary, not rules …
never rejected for the difference" is the sentence behind draft 10's "profile
validation of one's own record is not OKF consumption"; and its `stale_after`
"single absolute date" is the July form that upstream replaced with instants
on 2026-08-21, which is the revision §2.10 pins. The post says nothing about
`index.md`, approval, or a system of record — the layer this plan adds.

## 3 · What stays exactly as it is

The kernel's retrieval, chunking (decision 22), abstention method and
calibration; the fail-closed serve posture; the tool registration as
adopter-owned code (decision 23 — `min_trust_tier` lands on the handler side
with a default, so an existing registration keeps working and the boot
inspection tolerates its absence with a notice); the site shell and its
surface contract; the study attachments' guarantee; the takedown scope model
(decision 14, bar the `sor_id` clause); the pool posture (17); the scaffold's
root set minus one addition; every command an adopter runs today except
`takedown --export`. `stable_id` keeps its `knowledge/<path>` form — the OKF
concept id is the bundle-relative half.

## 4 · The work, in two phases

Each phase is red-first ($implement-spec): the acceptance below is written and
watched failing before the implementation. A phase may be a stack of PRs but
ships as **one release**, because the states between them are ones decision
19 forbids — the site and the door must never disagree, and a trust floor
must not exist on one surface and not the other.

### 4.1 Phase A — one record, both surfaces

Everything that makes the site and the kernel read the same record the same
way, and the door say what it knows. Lands: the `yaml` dependency and ONE
module set in `packages/content` (frontmatter shapes, the bare `verified`
mapping, both link forms, the checker's rules, the index generator, the
instance-resolution helper) — used by ingest, byte-copied to the site (which
declares `yaml`), and bundled into the emitted `check.mjs`; readers for the
policy and the ledger; `instance.md` format 2 in the kernel's parser;
`ksor build` (indexes, check, lock, `--strict`, `--as-of`); `ksor migrate`
(§1.8, `--write-site`); `ksor takedown` rewritten (record spec §5); the site:
comma-list viewers, the §2.5 table, staged index regeneration with the
fast path removed, the docs collection excluding `index.md`, badges, R14
stamps with `dirty`, `rel=` links where a twin exists, the ledger reader,
lock refusals, `ksor-site-outdated`, the per-manager `build` scripts losing
`export-denylist`; the kernel: schema 2.5 (`visibility TEXT` → `audience
TEXT[]` with GIN and `ARRAY[visibility]` backfill, `doc_status` mapped and
CHECKed on the new set, `sources`/`verified`/`generated`/`approval`/
`deprecated` JSONB, `effective_from`/`stale_after` TIMESTAMPTZ, `trust_tier`
SMALLINT, `ingestion_runs.build_id` + `policy JSONB` + `policy_sha256` +
`ledger_ids`, `takedown_denylist.ledger_id` + `actor` + `applied_at` +
`revoked_ledger_id` + `revoked_at`, `GOVERNANCE_SINCE` → 2.5), walked from
2.4 per decision 16; ingest running the checker, refusing without a fresh
lock, no node from reserved names, ledger entries applied in order and ids
attached to pre-existing rows; `lib/lifecycle.ts` and `lib/trust.ts` bound
beside `DENY` and `AUDIENCE_ALLOWED` in search, read, outline, the
calibration sampler (widest viewer list) and the boot gate, with the section
branch; the calibration digest and its uncalibrated refusal; the ingest
"unchanged" test including the toolchain tuple (a present defect: a
`CHUNK_POLICY` bump reports unchanged, `build.ts:434-460`); the door:
`min_trust_tier` (handler default `unverified`, boot notice when the
registration omits it), trust signals and `approval.checked` on every hit,
frontmatter on `read`, the viewer list bound into the snapshot token, R20
attributes in `retrieval_log`, the boot gate's ledger checks, the
served-surface golden regenerated, `tool-surface.md`; the starter and the
workbench fixture rewritten (three fixture descriptions written by hand);
docs, both READMEs, every skill that emits frontmatter; `specs/ksor/record/okf-SPEC.md`; KSP-001 draft 10; AGENTS.md decisions 26 and 27 with revision notes on
4, 7, 8, 10, 11, 12, 14, 15, 18, 19, 21, 23, 24, product principles 3 and 7,
the reproducibility invariant and the vocabulary.

Red first: a conformance fixture of profile documents (every valid shape,
one document per refusal slug, a mixed-audience folder with its committed
index) parsed and judged identically by kernel, emitted checker and site;
`AUDIENCE_CASES` rewritten for overlap with three-tier and section rows, and
`LIFECYCLE_CASES` new with the build-vs-request boundary row, both through
real Postgres and against the site's copy; a public staged tree containing
no byte of an internal concept's title, path or description via any index,
sidebar or search entry; the generator's output pinned against a golden in
OKF §8 form and the vendored §8 example; the lock built twice and identical
modulo `as_of`, byte-identical under `--as-of`; a takedown, a description
edit and an effectivity boundary each changing `build_id`; committing the
lock not changing `source_commit`; `ksor migrate --write` on the current
starter and fixture passing the new checker, `approved` → `draft` without
`--approve-by`, a tier expanded upward, summaries gaining their marker; the
R23 comparison; a draft, a not-yet-effective and a stale document absent
from every arm, outline and calibration sample while their human pages carry
badges; a section admitted to an outline only through a visible descendant;
`min_trust_tier: human-reviewed` never satisfied by a machine-confirmed hit
under any configuration (R18); a token minted at `[public]` refused at
`[public, internal]`; a shrunk ledger refused by build (with history) and by
ingest; a hand-appended unauthorised revocation refused by check, build and
ingest; a named revocation lifting the denial and a re-denial denying again;
a renamed denied document refused; a `removed` path reappearing refused; an
unledgered row refusing boot and an unmerged one reported; the MCP-client
walk — a takedown refused within the same second the ledger gains its
entry; a mismatched calibration digest booting into the uncalibrated
refusal; the shell-conformance suite's all-draft fixture corrected.

### 4.2 Phase B — exchange and integrity

Lands: `ksor build --bundles`; R22–R25 and the ledger's R27 against
repository history where the platform exposes identity, flipping
`approval.checked` to `change-control` and verifying that an edit to a
stable concept updated `generated.at`; `llms.txt` v2 URL forms and
path-scoped files as the site's `markdownPath` seam allows. Import (R26)
stays demand-gated — a second ingest adapter plus a verb when it arrives.

Red first: the `public` bundle of a record with one `[internal]` concept
contains no byte of it, read back by a bare OKF parser; an approval commit
that skipped review refused by name; a stable concept edited without a
`generated.at` bump refused by name.

## 5 · Costs recorded rather than argued away

- **Day one publishes nothing.** Builds are empty until a human approves —
  one conversational turn, and the claim made visible.
- **Every adopter re-measures its floor**; until then the door refuses every
  search as uncalibrated, which is the invariant, not a regression.
- **An upgraded served record has an outage window** between `ksor schema
--apply` and the first 2.5 ingest, because unledgered rows refuse boot;
  the runbook orders the steps so it is minutes.
- **Generated files in the record** — one per directory, changing only when a
  title, description or order changes.
- **`approved` becomes `draft` on migration** unless the human approves in the
  same act.
- **Whether an edit bumped `generated.at` is unverified until phase B**; the
  checker compares two authored instants and no more.
- **Stale documents leave the open web at the next build**, so a record
  with `stale_after` dates needs a scheduled rebuild.
- **A takedown needs the checkout**, and the site follows the merged ledger.
- **A shallow clone cannot verify the ledger**; the scaffold's CI fetches
  full depth, and a build elsewhere must say `--allow-unverifiable-ledger`.
- **Actor ids are published with the content**, on twins, `llms-full.txt` and
  `read`, exactly as a commit author is in a public repository; the starter
  uses handles, not addresses; KSP §12 redaction is by takedown of the
  concept.
- **Approvals are policy-checked, not change-control-verified, until phase
  B**, and every envelope says so.
- **Two new verbs and one removed mode are pre-1.0 API commitments** (`ksor
build`, `ksor migrate`, `takedown --export`).
- **The profile was wrong or silent about OKF in more places than first
  counted**, and the fixes are ours, in draft 10.

## 6 · What the reviews changed

Two adversarial rounds — code truth, recorded decisions, the OKF text,
internal consistency, the builder, security — each finding independently
re-verified: 98 held in the first round, 68 in the second. The ones that
changed the design, so the reasoning survives. Round one: a committed index
listing every concept would have been copied into the public stage and
rendered as a folder page — the R5 leak the whole visibility spec exists to
prevent — so staging regenerates and never copies (§2.4); `stable` requiring
`verified` made the day-one approval turn impossible under R25 and invited
R17's manufactured verification, so verification is decoupled (§2.13); the
boot gate was asked to read a file the served container does not carry, so
the ledger is ingested and the gate checks rows (§2.6, §2.7); a deleted
ledger line would have silently republished a taken-down document, so the
ledger is append-only and a shrink refuses (§2.7); shipping the site's new
semantics a release before the kernel's would have put the two surfaces in
exactly the disagreement decision 19 forbids, so one phase carries both;
`ksor build` refused itself on the stale index it exists to regenerate, so
it generates first; `Instance` and `Summary` as reserved types made the
starter and every summary fail the reserved-type rules, so neither is a
concept type; retiring `sor_id` is an owner decision against decision 14,
not a caveat, and gains a compensating refusal. Round two: the link rule was
stricter than its own rationale — an internal document's link to a public
page would have failed — so the rule admits public targets (§2.2); a
calibration mismatch downgrading to `gate: off` would have made a refusing
record answer everything, the opposite of the invariant, so it boots into
the uncalibrated refusal (§1.6); a revocation had no column to land in and
ingest was forbidden to delete, so rows gain `revoked_at` (§2.7); only the
verb checked a ledger actor, so a hand-appended revocation would have passed
— the checker validates every entry (§2.7); `ksor-takedown-dangling` would
have made a denied file undeletable forever, so entries carry `expected`
and an amendment marks removal (§2.7); migrating a ranked tier to a
one-element list would have dropped documents from every higher tier, so
migrate expands upward (§1.8); `as_of` pinned to a commit time meant stale
documents never left the open web without a commit, so it defaults to now
and the invariant's wording gains the clause (§2.9); and the trust floor
would have existed on one surface a release before the other, so the door's
half joins phase A (§4).

## 7 · What the implementation changed about this plan

Written 2026-08-25, after phase A landed. The plan above is left as it was
written — it is the reasoning, and supersession is visible — so this section
is where it and the code disagree. **The code wins over every sentence above.**

**The decision number.** §2's decisions became AGENTS.md **decision 27**, not 26. The YAML parser was split out and recorded first, because it landed before
the design it serves and a runtime dependency needs an entry of its own
(guard rule 5). §2 is annotated in place.

**Phase B (exchange and integrity) is implemented (issue #158).** `ksor build --bundles` now fully generates OKF bundles per viewer. The change-control clauses (R22–R25 verification against repository history), `llms.txt` v2 URL forms, and OKF import (R26) are still pending implementation as part of Issue #32.

**Two clauses grew during implementation, both from review.** The ledger's
baseline is `(id, digest)` pairs rather than ids alone, in both the git-history
baseline and the lock's `ledger_entries`: an id set cannot tell a committed
denial from the same id RETARGETED in place, which republished the denied
document and denied an innocent one with nothing red on any surface
(`ksor-ledger-amended`). And the site's lock freshness covers the CONTROL
files and the ASSETS, not only the documents — `instance_sha256`,
`policy_sha256`, `ledger_sha256` and `assets[]` — because a takedown was lifted
by deleting four lines while the committed lock still validated, and because a
replaced diagram changed what the site published with no refusal anywhere.

**The widening rule reaches assets, which the plan did not anticipate.** An
asset declares no audience, so it inherits one by position: the rule asks the
NEAREST ANCESTOR DIRECTORY that holds any concept whether one of them is
reachable. Asking only the asset's own directory was defeated by nesting it one
level deeper, in a directory holding no concept at all.

**Four refusal families the plan did not name**, each closing a key that would
otherwise fail open: `ksor-key-near-miss` (a top-level key one edit from a
profile key — a mistyped `stale_after` serves an expired document forever),
`ksor-derived-key` (a concept claiming a key the build writes, which would
publish it twice and make the derived trust tier non-authoritative), the
CLOSED `ksor:` block, whose optional keys are the ones that fail open —
`ksor.effective-from` with one hyphen published an embargoed policy four weeks
early with nothing refusing it — and `ksor-key-misplaced` (2026-08-25), the
near miss WITHOUT the miss: a governance key spelled correctly one level from
where the profile reads it, which no edit distance can see. A top-level
`effective_from: 2099-01-01T00:00:00Z` built clean and published the same day.
Its mirror, `ksor.stale_after`, was already refused — but the remedy said
"remove `stale_after:`", and following it published a document the author had
withdrawn, so no refusal in §2.7 prints a delete any more.

**Three things §1.8 assumed migrate could do once, and the code cannot.** All
three surfaced walking the upgrade path end to end, 2026-08-26.

The plan reads the transcription as a one-shot — "every existing denylist row
into the ledger" — and pairs it with the re-pointing above it, without noticing
that the two contradict each other: a re-pointed entry names `<dir>/overview`
and the ROW still names `<dir>/index`, so the row is accounted for by nothing
and `ksor-takedown-unledgered` refuses the record on both surfaces. The
one-shot rule then made the remedy those refusals print a no-op. Migrate
records the row as it stands beside the re-pointed hold, and appends to an
existing ledger any row nothing accounts for; regenerating one is still refused,
which is the guarantee the one-shot rule was reaching for.

The plan also has migrate delete the instance's `audiences:` model in the same
run that expands documents against it. A second run — an interrupt, a restored
`knowledge/` — then has no model, and "no model" is `[public]`: an internal
record republished by re-running the documented command. Losing the model is a
refusal, and `instance.md` is written last so an interrupted run is re-runnable.

And its `superseded_by` refusals cover a pointer that climbs out of `knowledge/`
and one on a document migrate is not deprecating, but not the commonest of the
three — a pointer that resolves to no concept at all, which `ksor build` refuses
as `ksor-supersession-strands` after migrate has written it.

**One thing the plan listed and the code does not do.** §1.8's migrate list
included `index.mdx`. `loadRecord` reads `.md` and `.yaml` as text and nothing
else, so an `.mdx` never reaches migrate; the record checker refuses one under
`knowledge/` by name (`ksor-file-type`) and an adopter carrying one moves it by
hand. The parenthetical is already corrected in §1.8.

**And one the plan predicted correctly and is worth naming because it is a
cost, not a win.** The tool surface grew: the served `tools` array measured
17,394 chars ≈ 4,349 tokens on 2026-08-25 — the three definitions' own JSON
sums to 17,390 of that, the array adding two brackets and two separators —
against ~2,990 tokens measured 2026-08-23 before the trust floor and the
per-hit governance block. That is
the price of an agent being able to tell a reviewed document from an
unreviewed one, charged once per session, and it is recorded in decision 23's
revision rather than argued away.

## 10. Out of Scope

_This section is non-normative in its rationale and normative in its exclusions._

A component belongs in this standard only when it owns a distinct architectural boundary. The following are explicitly not required for conformance:

**A2A or other agent-to-agent protocols.** A KSoR is not an agent. Agents using a KSoR may use such protocols elsewhere.

**A REST/OpenAPI surface.** Discovery, direct Markdown consumption, MCP, and OKF cover the defined boundaries. A REST contract MAY be added by an implementation when a real integration requires it, outside this standard.

**A graph database.** The corpus already forms a graph through ordinary Markdown links, which OKF treats as first-class relationships. Requiring Neo4j, RDF, OWL, or SPARQL is out of scope.

**W3C PROV and schema.org JSON-LD.** Both are compatible optional projections and MAY be standardised in a future proposal in this series if implementation experience warrants it.

---

## 11. Security Considerations

The threat model of a KSoR is unusual in that the protected asset can influence AI agent behaviour. Implementers should treat the following as first-order risks.

**Prompt injection through knowledge content.** The record is served to agents as trusted context. Ingestion and import pipelines (Section 6.4) are the primary defence: candidate knowledge passes local governance before it can reach an agent surface. Implementations SHOULD additionally sanitise or flag imperative content in imported material.

**Making ungoverned knowledge appear authoritative.** This is the attack the entire governance section exists to prevent. R1, R2, and R16 are the controls. Any path by which content reaches a projection without crossing the governance boundary is a critical vulnerability.

**Disclosure through secondary channels.** R5, R10, and R11 exist because titles, navigation, assets, embeddings, and links leak knowledge even when bodies are protected. Embedding stores deserve particular attention: a restricted document whose vector still produces search results is not restricted.

**Approval forgery through ordinary commits.** `ksor.approval` and `verified` are frontmatter, and frontmatter is text: anyone or anything with write access can assert them, including an agent maintaining the corpus. R22 through R25 are the controls: authority events must be validated against change control, status transitions demand authorised approval, review runs under the ownership map, and asserted actors must match platform identities. The cheapest attack therefore shifts from editing a file to subverting repository review. Branch protection, required review, and ownership rules on governance-bearing paths are part of the KSoR security boundary even though they live in the version-control layer, and the Governance Policy deserves the strictest protection of all (4.2.5.2), because owning it means owning every downstream decision.

**Build and supply-chain tampering.** Profile P-Verified (Section 8.2) is the control. Without it, a consumer cannot distinguish a legitimate publication from a tampered one.

**Identity spoofing and confused-deputy access.** R8 and fail-closed behaviour (8.1.3) are the controls. The agent surface must never forward an upstream identity's authority to a downstream request without local policy evaluation.

**Telemetry as an exfiltration path.** R20 is the control. Observability pipelines are often less protected than serving paths, and content captured into them silently becomes a shadow store.

---

## 12. Privacy Considerations

A KSoR may contain personal data inside institutional knowledge (named verifiers in `verified` entries, approvers in `ksor.approval`, deprecators in `ksor.deprecated`, authors in `generated`, actors in the takedown ledger, identities in audit history). Implementations SHOULD support redaction workflows that respect R9 (takedown) and SHOULD treat `verified.by`, `ksor.approval.by`, and `generated.by` identifiers as personal data where applicable law requires it. Takedown under R9 applies to newly produced artefacts and current projections. Handling of historical version-control data is a deployment policy matter outside this standard.

---

## 13. Versioning and Process

**13.1** This proposal is versioned independently of any implementation. Breaking changes to normative requirements increment the major version. Additive requirements and clarifications increment the minor version.

**13.2** The proposal advances through the stages: Draft Proposal, Candidate (two independent implementations of classes A and B exist), Adopted (accepted by the maintainers with community review), Superseded.

**13.3** KSP-001 version 0.1 normatively targets the OKF v0.2 specification in `SPEC.md` of `GoogleCloudPlatform/open-knowledge-format` at Git commit `ad30107c31c06aec8a7d5636e0d1058118604e6f` (2026-08-21), whose SHA-256 is `26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101` [okf-spec]. No tag or release identifies that revision, and the version label reads `0.2` both before and after upstream's change from dates to instants, so only the commit SHA and the file hash identify the semantics this proposal adopts. Drafts 8 and 9 pinned `okf/SPEC.md` in `GoogleCloudPlatform/knowledge-catalog` at commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`; that copy is a frozen snapshot which its repository now disowns, and it is superseded by this pin. A corpus MUST also declare `okf_version: "0.2"` in the bundle-root `index.md`, using the mechanism OKF defines for this purpose. Later edits to an upstream branch, reference implementation, or documentation do not change KSoR conformance. Adopting different OKF semantics requires a revision of this proposal. The adapter boundary (4.2.6) localises the implementation cost.

**13.4** Extensions SHOULD be proposed as separate proposal documents in this series rather than amendments, so that the core remains small.

---

## 14. Implementation Guidance (Non-Normative)

A reference implementation is being built at `github.com/panaversity/ksor` in the order below, from the inside outward.

**P0, knowledge infrastructure.** Write the profile conformance document and the `.ksor/governance.yaml` schema. Make the build validate both and fail on violations. Parse frontmatter into retrieval columns and enforce lifecycle, freshness, effectivity, trust, and audience predicates in SQL. Render trust badges on the human surface. Expose `min_trust_tier` on the agent surface and return frontmatter with results. Generate discovery artefacts under the governance filter with publication stamping. Ship OKF export as governed bundle selection. Validate the Governance Policy and R22 through R25 against repository history as part of the build gate, since authority claims are worthless until they are checkable, and the `generated.at` versus `approval.at` comparison of R23 is the cheapest high-value check in the suite. Test every projection against R5 and R13 first, since those two rules catch the most damaging failure modes.

**P1, enterprise trust and operation.** OAuth/OIDC for protected surfaces with fail-closed behaviour. OpenTelemetry with the operational attribute set. SLSA provenance and Sigstore signing. One end-to-end `Attested Computation` in a real vertical. Bank reconciliation in an accounting KSoR is a natural first target: the record holds the reconciliation policy at rung 2 and the sanctioned reconciliation computation at rung 3, so a Digital FTE's reported figures are mechanically checked rather than trusted.

**P2, broader interoperability.** OKF import as candidate knowledge. W3C PROV export if external provenance exchange requires it. JSON-LD where public web discovery benefits. Further interfaces only where a demonstrated gap exists.

The architecture reduces to three lines that implementers should be able to recite:

> **One authoritative record.**
> **One governance boundary.**
> **Many open projections.**

---

## 15. Open Issues

1.  Chunking or truncation policy for `/llms-full.txt` on very large corpora.
2.  Whether per-page Markdown routes should honour a future `.okfignore` convention if the OKF community adopts one.
3.  _Resolved in draft 10._ The numeric encoding of trust tiers in retrieval stores: the reference encoding is a small integer ordered unverified < machine-confirmed < human-reviewed (Section 5), which is the ordering R18 requires and nothing more.
4.  Whether computation attestation receipts may be exported as evidence artefacts alongside publication attestations, or remain strictly runtime-only as OKF currently prescribes. To be resolved in the attestation follow-on proposal.
5.  A conformance test suite: the requirement identifiers in this document are written to be mechanically testable, and a companion proposal defining the test suite is anticipated.

Three issues from earlier drafts were resolved in draft 8: OKF specification pinning (a commit and file hash plus `okf_version` since draft 10, 13.3), canonical audience representation (now explicit `ksor.audience` on every concept, 4.2.2.4 and 4.2.4.2), and Governance Policy serialisation (now `.ksor/governance.yaml`, 4.2.5). Draft 10 resolves issue 3 above, in place, so that the numbering stays stable.

---

## 16. References

### Normative

[okf-spec] Open Knowledge Format, Version 0.2, `SPEC.md`, GoogleCloudPlatform/open-knowledge-format, commit `ad30107c31c06aec8a7d5636e0d1058118604e6f`, 2026-08-21, SHA-256 `26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101`. No tag or release identifies this revision. Supersedes the draft 8 and draft 9 pin of `okf/SPEC.md` in GoogleCloudPlatform/knowledge-catalog at commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` (2026-07-24), a frozen snapshot that repository now disowns.
[llmstxt-spec] The /llms.txt file, v2. Answer.AI, September 2024, revised August 2026. llmstxt.org.
[mcp-spec] Model Context Protocol specification. modelcontextprotocol.io.
[rfc2119] Bradner, S. Key words for use in RFCs to Indicate Requirement Levels. RFC 2119.
[rfc8174] Leiba, B. Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words. RFC 8174.

### Informative

[okf-v01] Introducing the Open Knowledge Format. Google Cloud Blog, June 2026.
[okf-v02] Open Knowledge Format v0.2 tackles agentic trust. Google Cloud Blog, July 2026.
[fumadocs-llms] Fumadocs AI and LLMs integration documentation. fumadocs.dev.
[slsa] Supply-chain Levels for Software Artifacts. slsa.dev.
[sigstore] Sigstore. sigstore.dev.
[otel] OpenTelemetry. opentelemetry.io.

---

## Appendix A. Example Concept Document

A conformant `Policy` concept in the KSoR Profile of OKF:

```markdown
---
type: Policy
title: Capitalisation of Software Implementation Costs
description: Criteria for capitalising software implementation costs under the organisation's accounting standards.
status: stable
tags: [accounting, capitalisation]
generated: { by: "human:jsmith@example", at: 2026-05-10T09:00:00Z }
verified:
  - { by: "human:kliu@example", at: 2026-05-12T14:00:00Z }
stale_after: 2027-01-31T00:00:00Z
sources:
  - id: ias38
    resource: https://www.ifrs.org/issued-standards/list-of-standards/ias-38-intangible-assets/
    title: IAS 38 Intangible Assets
ksor:
  owner: team:finance-controller
  audience: [finance, audit]
  approval: { by: "human:cfo@example", at: 2026-05-14T10:00:00Z }
---

# Criteria

An implementation cost may be capitalised when all of the following hold. [^ias38]

1. The cost creates an identifiable intangible asset.
2. Future economic benefits are probable.
3. The cost can be measured reliably.

# Exclusions

Training and data migration costs are expensed as incurred. [^ias38]

[^ias38]: IAS 38, Intangible Assets.
```

The concept satisfies 4.2.2 (all required fields, `sources` present on a reserved type, and `generated` with `generated.at`, `ksor.approval`, and explicit `ksor.audience` present where required) and 4.2.4 (`ksor.owner` present on a reserved type, `ksor.approval` present on a stable concept). `verified` is present but not required (4.2.2.3): it is what raises the trust tier to human-reviewed, and its approval is a separate fact recorded by a different actor, illustrating R17. Its footnote reference and definition are both keyed to the source id `ias38` (4.2.3.5). Under `ksor.audience` it is excluded from open-web artefacts for any audience other than `finance` and `audit` per R5 and R12.

## Appendix B. Requirement Summary Table

| Req | Short name                             | Classes            |
| --- | -------------------------------------- | ------------------ |
| R1  | No bypass of the record                | B, C, D, E         |
| R2  | Governance precedes projection         | B, C, D, E         |
| R3  | One policy, all surfaces               | B, C, D, E         |
| R4  | No shadow authority                    | B                  |
| R5  | Absence means absence                  | B, C, D, E         |
| R6  | Static filtering before build          | B                  |
| R7  | Dynamic filtering before disclosure    | C, D               |
| R8  | Identity is evidence, not authority    | C, D (P-Protected) |
| R9  | Takedown outranks everything           | B, C, D, E         |
| R10 | Assets inherit authority               | B                  |
| R11 | Links can disclose                     | B                  |
| R12 | Discovery downstream of governance     | B                  |
| R13 | Lifecycle and effectivity on open web  | B                  |
| R14 | Artefacts carry their publication      | B, E               |
| R15 | Export downstream of governance        | E                  |
| R16 | Import confers no authority            | E                  |
| R17 | Approval is not verification           | A, E               |
| R18 | Tiers never cross downward             | C, D               |
| R19 | Signatures prove integrity, not truth  | B (P-Verified)     |
| R20 | Telemetry inside governance            | C, D               |
| R21 | One identifier per publication         | B, C, D, E         |
| R22 | Authority claims are change-controlled | B                  |
| R23 | Status transitions are governed events | B                  |
| R24 | Ownership binds review                 | B                  |
| R25 | Recorded actors are truthful           | B                  |
| R26 | Import lands as draft                  | E, B               |
| R27 | Takedown is a governed write           | B                  |

Normative requirements also appear as numbered clauses outside the R-series. The table below maps the clause groups to conformance classes so that a test-suite author working from this appendix misses nothing.

| Clauses            | Subject                                                                                      | Classes                      |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------- |
| 4.1.1 to 4.1.4     | Record as OKF bundle, reserved filenames, canonical flow                                     | A                            |
| 4.2.1 to 4.2.3     | Reserved types, required fields, trust vocabulary                                            | A (build gate: B)            |
| 4.2.4.1 to 4.2.4.6 | Governance extension: owner, audience, approval, effective\_from, deprecated, superseded\_by | A (build gate: B)            |
| 4.2.5.1 to 4.2.5.4 | `.ksor/governance.yaml`: registry, ownership, authorities; `.ksor/takedowns.yaml`            | A (validation: B)            |
| 4.2.6.1            | Adapter boundary                                                                             | B, C, D, E                   |
| 5.1 to 5.4         | Retrieval predicates and abstention basis                                                    | C                            |
| 6.1.1 to 6.1.3     | Human surface                                                                                | B                            |
| 6.2.1 to 6.2.5     | Discovery surface                                                                            | B                            |
| 6.3.1 to 6.3.5     | Agent surface contract                                                                       | D                            |
| 6.4.1 to 6.4.3     | Exchange                                                                                     | E                            |
| Section 7          | Guarantee claims per rung                                                                    | A to E                       |
| 8.1.1 to 8.1.4     | Identity                                                                                     | P-Protected                  |
| 8.2.1 to 8.2.4     | Publication integrity                                                                        | B (8.2.2 onward: P-Verified) |
| 8.3.1 to 8.3.2     | Observability                                                                                | C, D                         |
| 13.3               | OKF v0.2 specification pinning by commit and file hash                                       | A                            |

---

## Acknowledgements

This proposal consolidates working drafts produced with the assistance of Claude (Anthropic) and ChatGPT (OpenAI), and builds directly on the Open Knowledge Format published by the Google Cloud Data Cloud team, the `llms.txt` convention proposed by Jeremy Howard, and the Model Context Protocol. The governance-first framing draws on the KSoR concept developed in _The AI Agent Factory_.

## Change Log

| Version      | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 draft 10 | 2026-08-25 | Corrections from building the profile, listed in `research/okf-native.md` §2.15 and applied under the rule that where the specification and the code disagree, the code wins and the specification is corrected. Re-pinned OKF from the `knowledge-catalog` snapshot at `3fcbb9f8` to `GoogleCloudPlatform/open-knowledge-format` `SPEC.md` at commit `ad30107c` (2026-08-21) with its SHA-256 (1.2, 13.3, [okf-spec]); every timestamp is an ISO 8601 instant and `stale_after` is an instant evaluated as `now >= stale_after` (4.2.3, 4.2.3.4, 5.1, 6.1.2, Appendix A). Dropped `verified` from the `stable` floor and made `generated.at` a profile requirement on stable concepts (4.2.2.3, R23, Appendix A). Recorded that only `runtime` is OKF-required on `Attested Computation` (4.2.3). Required acceptance of the bare `verified` mapping (4.2.3.3) and keyed per-claim footnotes, reference and definition, to `sources[].id` (4.2.3.5). Stated that profile validation of one's own record is not OKF consumption (4.2, 4.2.2.5). Added `ksor.deprecated` (4.2.4.5), `ksor.superseded_by` (4.2.4.6), and top-level `order` (4.2.2.6). Placed the bundle root at `knowledge/` with `instance.md`, `.ksor/` and the build lock beside it, made the instance document a profile-shaped document rather than a concept, and gave the root index its heading, not a summary, from the instance `title` (2.2, 4.1.2). Made `audiences` and `ownership` optional in the Governance Policy (4.2.5, 4.2.5.1). Named `Document` as the never-reserved default type, `Summary` as a companion marker, and reserved `README.md` (4.2.1.2 to 4.2.1.4). Distinguished the committed `index.md` map from the filtered indexes projections regenerate, and recorded that subdirectory bullets carry no description (4.1.2, 6.2.3). Defined the viewer list and the overlap rule and sharpened the link rule (4.2.4.2, R11). Made the takedown record an append-only ledger whose every entry names a listed actor (2.2, 2.3, 4.2.5.3, 4.2.5.4, R25, R27). Renamed the profile's "Generation" to "Publication", leaving "generation" to implementations as the counter a citation pins (2.2, 3.4, R1, R14, R21, 6.2.5, 7, 8.2.1, 14). Specified the reference trust-tier encoding and closed Open Issue 3 in place (5.1, 15). The conformance classes and the requirement numbering are unchanged. |
| 0.1 draft 9  | 2026-08-24 | Clarified OKF's dual architectural role. The canonical KSoR record is now described consistently as Markdown in the KSoR Profile of OKF, making OKF foundational to the authoritative record rather than only an exchange format. The same native OKF representation is reused for governed interoperability, so Class E exchange is described as selection and packaging rather than translation into a separate knowledge model. Updated the Executive Brief, Abstract, relationship-to-standards section, terminology, Section 3 responsibility table and diagram, Section 4 authoritative-record language, Section 6.4 exchange explanation, and the KSoR-versus-OKF differentiation without changing the conformance model or governance requirements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0.1 draft 8  | 2026-08-24 | Publication and conformance repair pass: restored story-first ordering in the Executive Brief and kept the nine responsibilities there in plain language, corrected the Section 3 diagram so human serving, AI discovery, MCP, and OKF are parallel outward boundaries, made `ksor.audience` mandatory for every concept, defined deterministic Governance Policy scope resolution, removed semicolons from editable prose, repaired the `llms.txt` wording, restored the leadership reading path to the Write-Side Lifecycle and Trust Ladder, and pinned KSP-001 v0.1 to the immutable OKF v0.2 release specification at commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`. The pinned specification defines `stale_after` as a `YYYY-MM-DD` date.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0.1 draft 7  | 2026-08-24 | Reframed the proposal around KSoR as an open, vendor-neutral knowledge infrastructure framework. Moved the three-line model and nine responsibilities to the front of the Executive Brief, clarified framework versus deployed infrastructure layer, strengthened the Abstract, expanded Section 3 so the responsibilities and boundaries, rather than a technology list, are the organising architecture, distinguished open protocol bindings from reference implementation choices, and made vendor-neutrality explicit from page one. No normative governance requirements changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | \n  | 0.1 draft 6 | 2026-08-24 | Specification-hardening pass: made `ksor.audience` explicit and fail-closed, standardised the Governance Policy at `.ksor/governance.yaml` with portable rule semantics, added `ksor.effective_from` to retrieval and open-web gating, required `generated` for stable concepts and strengthened R23, narrowed R4 from no omission to no shadow authority, changed `stale_after` to the date semantics defined by the OKF v0.2 release specification later pinned in draft 8, aligned the Executive Brief with publication-time guarantees, and repaired tables and the table of contents. | \n  | 0.1 draft 5 | 2026-08-24 | Added the non-normative Executive Brief ahead of the Abstract, so that decision-makers without technical background can evaluate the proposal: the problem story, the one-line principle, the trust ladder as a risk table, the write-side lifecycle as an approval workflow, protections, costs, and the decision being asked. No normative content changed. | \n  | 0.1 draft 4 | 2026-08-24 | Write-side governance completed: added the Governance Policy (4.2.5) as the normative root of authority, the write-side lifecycle summary (4.3), and requirements R23 to R27 covering status transitions, ownership-bound review, actor truthfulness, import mechanics, and governed takedown. Consistency pass: conformance class descriptions updated for R22 to R27, cross-references added between R9 and R27, R16 and R26, 4.2.4 and 4.2.5, and 8.1.2, adapter boundary renumbered to 4.2.6, abstract count corrected to twenty-seven, terminology extended with Governance Policy, candidate knowledge, and takedown, Appendix B extended, Open Issue 4 narrowed to serialisation only. | \n  | 0.1 draft 3 | 2026-08-24 | Second review revision: added R22 requiring authority claims to correspond to change-control events, with the matching security paragraph and the evidence chain in 8.2.4. Corrected the actor convention attribution (`team:` is a profile extension, not OKF). Fixed the reference SQL audience predicate to overlap semantics with NULL as public. Defined the instance document and its relationship to the bundle-root `index.md`. Reserved `public` as an audience identifier. Changed "conformant to" to "following" for `llms.txt` v2. Extended Appendix B with the clause-level requirement map and R22. | \n  | 0.1 draft 2 | 2026-08-24 | Review revision: added the `ksor` governance extension (owner, audience, approval, effective\_from), documented the OKF reserved-filename contract, restated the governance boundary as governance before every disclosure, updated the discovery surface to `llms.txt` v2 with `llms-full.txt` as a KSoR extension, changed `stale_after` to an ISO 8601 instant, marked Profile P-Attested experimental pending an attestation follow-on proposal, fixed the Class D binding to MCP for version 0.1, and revised the identity line to "OAuth/OIDC establishes identity. KSoR governance controls access." | \n  | 0.1 draft 1 | 2026-08-24 | Initial draft proposal, consolidating decision draft D25. | \n  |
