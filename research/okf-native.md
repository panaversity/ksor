---
issue: okf-native-spec branch (set to the PR URL when it opens)
status: accepted (phase A built; phase B not started — §7)
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
neither its owner nor a takedown authority; a reserved type with no `sources`
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

1. **The conformance floor replaces the numeric ladder.** Level 0 was `title`
   - `status`; the floor is `type`, `title`, `description`, `status`,
     `ksor.audience`, and a policy naming approval and takedown actors. The
     escape for a record that wants no owners or sources is a **non-reserved
     type**; the profile names one, `Document`, and promises never to reserve
     it. "The ladder" now means §7's trust rungs. Revises decision 7, product
     principle 7, the vocabulary row `level`. Reversed if a real adopter cannot
     reach the floor.
2. **Audience is a required list with overlap semantics; omission fails.** No
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
3. **Drafts live in the preview; builds exclude them from every surface.**
   `pnpm dev` is the review surface (decision 7) and shows drafts marked;
   every build — human pages, sidebar, search index, machine artefacts —
   excludes them, because a static site's search index and sidebar are
   open-web machine artefacts too (R13). `KSOR_DRAFTS=show` admits drafts to
   human surfaces only, is recorded in the lock and the id, and marks the
   build `noindex`. Every other status is admitted per surface by one table
   (record spec §2.5), so both surfaces refuse the same states (decision 19).
4. **`index.md` is generated, committed and drift-checked; nothing is
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
5. **`x.summary.md` carries exactly `type: Summary`** and nothing else, and
   `Summary` is a companion marker outside the concept type system, not a
   reserved type. A one-key allow-list closes the same three leaks decision
   24's class refusal closed; ingest still creates no node; the widening rule
   evaluates a companion's body with its parent's audience. Under bare OKF a
   summary is a concept; the no-independent-id guarantee is a profile rule,
   stated as such in draft 10. Decision 24's no-independent-id clause is
   untouched.
6. **`instance.md` is a profile-shaped document beside the bundle, not a
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
7. **Takedowns are an append-only committed ledger the verb also applies
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
8. **Real YAML.** The `yaml` package (zero dependencies, ISC) in the kernel
   and declared by the scaffold site; the emitted `check.mjs` is **built**
   from the kernel's checker and index generator by a second tsdown entry at
   package-build time — one rule set, bundled self-contained with the parser
   and its ISC notice, into both skill copies, gitignored in the templates
   like `schema/` — so adopter CI still runs with no install. Revises
   decisions 10 (the emitted checker carries a third-party notice), 12 (the
   dependency list) and 18 (the copy is generated, not hand-kept).
9. **`ksor build` is in scope, database-free, and checks before it writes.**
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

**Phase B is not started, so §1.7 is intent.** `ksor build --bundles` parses
its flag and exits `2`. So do the change-control clauses: R22–R25 verification
against repository history does not exist, which is why every envelope says
`approval.checked: "policy"` — the honest form — and why "whether an edit
bumped `generated.at`" stays in §5's cost list rather than being closed.
`llms.txt` v2 URL forms and OKF import (R26) are likewise unwritten.

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

**Three refusal families the plan did not name**, each closing a key that would
otherwise fail open: `ksor-key-near-miss` (a top-level key one edit from a
profile key — a mistyped `stale_after` serves an expired document forever),
`ksor-derived-key` (a concept claiming a key the build writes, which would
publish it twice and make the derived trust tier non-authoritative), and the
CLOSED `ksor:` block, whose optional keys are the ones that fail open —
`ksor.effective-from` with one hyphen published an embargoed policy four weeks
early with nothing refusing it.

**One thing the plan listed and the code does not do.** §1.8's migrate list
included `index.mdx`. `loadRecord` reads `.md` and `.yaml` as text and nothing
else, so an `.mdx` never reaches migrate; the record checker refuses one under
`knowledge/` by name (`ksor-file-type`) and an adopter carrying one moves it by
hand. The parenthetical is already corrected in §1.8.

**And one the plan predicted correctly and is worth naming because it is a
cost, not a win.** The tool surface grew: the served `tools` array measured
16,214 chars ≈ 4,054 tokens on 2026-08-25 — the three definitions' own JSON
sums to 16,210 of that, the array adding two brackets and two separators —
against ~2,990 tokens measured 2026-08-23 before the trust floor and the
per-hit governance block. That is
the price of an agent being able to tell a reviewed document from an
unreviewed one, charged once per session, and it is recorded in decision 23's
revision rather than argued away.
