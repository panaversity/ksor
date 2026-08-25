---
status: draft
date: 2026-08-25
claim: a system of record is where the official version lives, and vendor-free is the ownership argument — a record that is literally an open bundle any OKF consumer can read with no ksor in the loop is the strongest form of "what a customer owns is the source"
---

# The record: Markdown in the KSoR Profile of OKF (Class A)

The record is an OKF bundle constrained by the KSoR Profile (KSP-001 §4).
This spec is the profile **as implemented** — what a document must say, what
the control files beside it say, and what the checker refuses. Where this
spec and KSP-001 disagree, this spec is the code's contract and the proposal
is corrected in draft 10 (the list is in `research/okf-native.md` §2.15).
OKF is pinned to `GoogleCloudPlatform/open-knowledge-format` `SPEC.md` at
commit `ad30107c31c06aec8a7d5636e0d1058118604e6f` (2026-08-21; sha256
`26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101`, 37,748
bytes), vendored **byte-exact** at `specs/ksor/record/okf-SPEC.md` — excluded
from the formatter and asserted against `OKF_PIN.spec_sha256`, the digest every
`build.lock.json` stamps, so the pin can never name bytes the tree does not
hold; every timestamp in that revision is an instant.

## 1 · The bundle and what sits beside it

| Path                                  | What it is                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`                          | **the bundle** (OKF §3). Every `.md` inside it is a concept, except the reserved and companion files below                                                                                                                         |
| `knowledge/**/index.md`               | reserved by OKF (§8): **generated** by `ksor build`, committed, drift-checked; no frontmatter except `okf_version: "0.2"` at the bundle root; never authored; never copied into a stage; never a link source for the widening rule |
| `knowledge/**/log.md`                 | reserved by OKF (§9): not generated; an authored one is refused                                                                                                                                                                    |
| `knowledge/**/README.md`              | reserved by **this profile** (today's tree reader takes it as an index name, `plain-tree.ts:47`; a bare OKF reader would take it as a concept): refused                                                                            |
| `<doc>.summary.md`                    | companion — frontmatter is exactly `type: Summary`; outside the concept rules of §2 entirely; no route, id, node or entry of its own (study-attachments spec)                                                                      |
| `<doc>.{flashcards,quiz,slides}.yaml` | companions, invisible to OKF; unchanged                                                                                                                                                                                            |
| `instance.md`                         | the instance document (§3) — **beside** the bundle, not in it                                                                                                                                                                      |
| `.ksor/governance.yaml`               | the Governance Policy (§4) — committed; the root of authority                                                                                                                                                                      |
| `.ksor/takedowns.yaml`                | the takedown ledger (§5) — committed, append-only                                                                                                                                                                                  |
| `.ksor/out/`                          | build output, ignored                                                                                                                                                                                                              |
| `build.lock.json`                     | written by `ksor build`, committed (build spec)                                                                                                                                                                                    |

The scaffold `.gitignore` reads `.ksor/*`, `!.ksor/governance.yaml`,
`!.ksor/takedowns.yaml` (the directory form `.ksor/` cannot be negated —
verified against git). The bundle root is `knowledge/`, so a bare OKF
consumer handed that directory sees a conformant bundle and nothing of the
site or the system. Identity: a concept's id is its bundle-relative path
without `.md` (OKF §2); ksor's `stable_id` is `knowledge/<id>`. `sor_id` is
retired — path is identity (an owner decision against decision 14; the
compensating refusal is `ksor-takedown-dangling`, §5). **A directory is
always the `knowledge/<dir>#section` node** (today only an index-less
directory took that shape, `plain-tree.ts:213`; a generated `index.md`
creates no node): no body, no governance of its own, admitted to an outline
iff a descendant is visible to the viewer (a row in both decision tables),
and the anchor a `subtree` takedown names.

## 2 · A concept

```yaml
---
type: Policy # required; reserved or custom (§2.1)
title: Purchase approval # required
description: Who may approve … # required, one sentence
status: draft # required: draft | stable | deprecated
order: 2 # KSoR extension, optional
generated: { by: "claude-code/1.0", at: 2026-08-20T09:00:00Z } # required when stable
sources: # required on reserved types
  - { id: fin-2024, resource: https://…, title: Finance handbook 2024 }
verified: # optional; sets the trust tier
  - { by: "human:kim", at: 2026-08-21T14:00:00Z }
stale_after: 2027-08-21T00:00:00Z
ksor:
  audience: [public] # required, list, never inferred
  owner: team:finance # required on reserved types
  approval: { by: "human:cfo", at: 2026-08-22T10:00:00Z } # required when stable
  effective_from: 2026-09-01T00:00:00Z
  superseded_by: policies/purchase-approval-v2 # KSoR extension; with deprecated
  deprecated: { by: "human:cfo", at: … } # required when deprecated
---

A purchase above 10,000 needs a director's signature. [^fin-2024]

[^fin-2024]: Finance handbook 2024, §3.
```

**2.1 Types.** Reserved, with governance meaning (KSP 4.2.1): `Policy`,
`Procedure`, `Control`, `Standard`, `Definition`, `Decision Record`,
`Example`, `Attested Computation`. Any other value is a custom type;
type-keyed rules (`sources`, `ksor.owner`) apply to reserved types only — the
level-0 escape. `Document` is the profile's named non-reserved default, used
by the starter and by `ksor migrate`, and will never be reserved. `Summary`
is a companion marker (§1), not a concept type.

**2.2 Required everywhere:** `type`, `title`, `description`, `status`,
`ksor.audience`. **On reserved types:** `sources`, `ksor.owner`. **When
`stable`:** `generated` (with `at`) and `ksor.approval`, with `generated.at
<= ksor.approval.at` (R23 — a comparison of two authored instants; whether an
edit updated `generated.at` is the author's obligation until change-control
verification lands, plan §4.2). **When `deprecated`:** `ksor.deprecated:
{ by, at }` by the resolved owner or a takedown authority (R23's last
sentence), and usually `ksor.superseded_by`. `verified` is never required: a
stable, approved, unverified concept is the honest state and sits at tier
_unverified_ (a deliberate divergence from KSP 4.2.2.3; plan §2.13).

**2.3 Shapes.** The OKF v0.2 trust vocabulary at the pinned commit:
`sources[]` entries carry `resource` (required — a URL, a bundle path, or a
scope descriptor; `ksor-source-unresourced`), `id`, `title`; per-claim
citation is a GFM footnote **reference and definition** whose label is a
`sources[].id` — the checker inspects both, and an unmatched label in either
is `ksor-footnote-unkeyed` (footnotes are the one extension to CommonMark;
they degrade to readable text); `verified` is a list of `{by, at}` and a bare
mapping is accepted as a one-element list (OKF §5.2 MUST). Links resolve in
both OKF §6.1 forms — bundle-absolute (`/policies/x.md`, against
`knowledge/`) and relative (against the source's directory), `.md` optional;
the site rewrites bundle-absolute links to routes. Actors: `human:<id>`,
`process:<id>`, `<producer>/<version>` everywhere; `team:<id>` only in
`ksor.owner` and in the policy — in `verified`, `generated`, `approval` or
`deprecated` it is refused (`ksor-actor-form`), because tiers key on the
`human:` prefix and a team would silently classify as machine-confirmed.
Actor ids are published with the content; use handles, not addresses. Every
timestamp is an ISO 8601 instant with an explicit offset; `ksor migrate`
widens a bare date to midnight UTC. Trust tier derives from `verified`: none
→ unverified; machine actors only → machine-confirmed; any `human:` →
human-reviewed.

**2.4 Audience.** A list of identifiers; `public` is reserved; every other
identifier must be in the policy's registry. A **viewer** holds a list that
must include `public`; a concept is visible when the two lists overlap.
Omission is refused, never defaulted. **Widening rule:** a link, a
`ksor.superseded_by` pointer, or a companion body (evaluated with its
parent's audience) may reach a target whose audience list contains `public`
or contains every identifier in the source's — then every reader of the
source can read the target. `[internal]` → `[public]` passes; `[public]` →
`[internal]` refuses (`ksor-link-widens`, `ksor-supersession-strands`).

**2.5 Lifecycle, by surface.** Human surfaces are the page, the sidebar and
on-site search; machine surfaces are `llms.txt`, `llms-full.txt`, `/md/`,
`server.json`, bundles and the door. Effectivity and staleness are evaluated
at the build's `as_of` for static output and at request time on the door;
the two can disagree on a concept that crosses a boundary between a build
and a request, which is disclosed (`LIFECYCLE_CASES` pins the row).

| Status                            | Human surfaces                                       | Machine surfaces |
| --------------------------------- | ---------------------------------------------------- | ---------------- |
| `draft`                           | preview only, marked; builds with `KSOR_DRAFTS=show` | never            |
| `stable`, effective, unexpired    | yes                                                  | yes              |
| `stable`, before `effective_from` | yes, badge "effective from …"                        | no               |
| `stable`, past `stale_after`      | yes, badge "past its review date"                    | no               |
| `deprecated`                      | yes, with its successor                              | no               |

**2.6 The fence.** Frontmatter is the YAML between a `---` first line and
the next `---` line (trailing blanks tolerated on both, BOM and CR/CRLF
normalised first); that closing line is found by a line walk, so a
frontmatter may not contain a bare `---` line — not even inside a block
scalar. One YAML document, plain data only: an unknown or non-plain `!!tag`,
a duplicate key, a second document marker or a non-mapping is
`ksor-frontmatter-invalid`. No fence at all is a document with no
frontmatter (then `ksor-missing-key`).

**2.7 Unknown keys** are preserved and never refused (OKF §11) at the
**concept's own top level** — with three exceptions, each of which is a key
that would otherwise fail OPEN.

1. `id`, `name`, `visibility`, `provenance`, `owner`, `effective`,
   `superseded`, `superseded_by` and `sor_id` are refused by name
   (`ksor-legacy-key`) with the migration hint, because each is a pre-profile
   key whose silent survival would mean silent loss of governance.
   `superseded_by` is on that list for the same reason as the rest: the profile
   reads `ksor.superseded_by`, so a top-level one announces a successor no
   surface shows.
2. A top-level key **one edit** from a profile key (`type`, `title`,
   `description`, `status`, `order`, `generated`, `sources`, `verified`,
   `stale_after`, `ksor`) is `ksor-key-near-miss`, naming the key it is one
   edit from. Preserving is right for a key nobody knows and wrong for a key
   that is the profile's own with a letter missing: a mistyped `stale_after`
   serves an expired document forever, and nothing goes red.
3. The keys the BUILD derives — `trust_tier`, `build_id`, `source_commit`,
   `ksor_version`, `dirty`, `unstamped` — are `ksor-derived-key` at a
   concept's top level. The markdown twin and the `llms-full.txt` block append
   them under the record's own frontmatter, so a document that declares one
   publishes it TWICE: the twin then fails the record's own reader
   (`uniqueKeys: true`), and a lenient consumer picks one of the two, which
   makes the derived trust tier non-authoritative and the R14 build stamp
   forgeable by whoever writes the document.
4. The **`ksor:` block's own key set is CLOSED** — `audience`, `owner`,
   `approval`, `effective_from`, `superseded_by`, `deprecated` — and anything
   else there is `ksor-ksor-key-unknown`. That namespace is ksor's, not OKF's,
   so §11 does not reach it, and the keys that fail open are the OPTIONAL ones:
   a typo in a required key already surfaces as `ksor-missing-key`, while
   `ksor.effective-from` (one hyphen) published an embargoed policy four weeks
   early with no refusal anywhere (reproduced 2026-08-25).

## 3 · The instance document

`instance.md`, `format: 2`, a profile-shaped document outside the bundle —
not an OKF concept (KSP §2.2 is corrected). Keys: `name` (the machine
identity citations and `llms.txt` use — the one sanctioned identity key, an
explicit exception to product principle 3), `title` (the display title and
the root index's heading; the old body H1), `description` (one sentence;
seeds `llms.txt` and `server.json`), `toolchain: { requires, scaffolded }`
(the upgrade stamp, moved from `ksor:`), and the deployment keys as today:
`database`, `embedding`, `retrieval`, `budgets`, `site`, `mcp_url`,
`version`. No `type`, `status` or `ksor.audience` — identity is not
knowledge and the lifecycle table does not apply to it. `audiences:`,
`default_visibility:` and `ksor:` are refused with the hint to move them. The
body is the MCP server's instructions **in full** (the "first paragraph"
sentence in the scaffold was already false to `instance.ts:375`).

## 4 · The Governance Policy

`.ksor/governance.yaml`, KSP-001 §4.2.5's families and scope resolution:
`version`; `audiences` (each with `description`; `public` may not be
declared; optional — absent means only `public`); `ownership` (scoped rules
with `owner`, `escalation`; optional — absent means R24 binds nothing);
`approval_authorities` (scoped rules with non-empty `actors`; required);
`takedown_authorities` (`actors`; required). A level-0 policy is the two
required families. **Every object in the file has a CLOSED key set** — root,
`scope`, an audience entry, an `ownership` rule, an `approval_authorities`
rule, `takedown_authorities` — and an unknown key is `ksor-policy-invalid`
naming the key, the nearest allowed one and the set. There are no extension
keys here: a stripped key in the root of authority WIDENS it, because
`scope: { path: [...] }` (one letter) leaves an empty scope, which matches
every concept and made a drafts-only rule the record's fallback (reproduced
end to end, 2026-08-25). The policy is ingested — the registry and authority sets
as `ingestion_runs.policy JSONB`, plus `policy_sha256` — so the door and the
snapshot token bind to a row, and the served container never needs the file.

## 5 · The takedown ledger

`.ksor/takedowns.yaml`: an append-only list, ids minted by the verb
(`<at>-<6 random>`, unique or `ksor-ledger-invalid`). Entry kinds:

- a **denial** `{ id, stable_id, scope: node | subtree, expected: present |
removed, by, at, reason }` — `expected` is `present` when the verb saw the
  file and `removed` when it did not (a denial may precede the document it
  names, decision 14);
- a **revocation** `{ id, revokes: <id>, by, at, reason }`;
- an **amendment** `{ id, amends: <id>, expected: removed, by, at, reason }`
  — the sanctioned way to delete a denied file: amend, then delete, in the
  same change.

Only `ksor takedown` writes it, and that is **enforced by validation, not
assumed**: every entry's `by` — denial, revocation, amendment — is checked
against `takedown_authorities` by `pnpm check`, `ksor build` and ingest
(`ksor-takedown-unauthorised`), so a line hand-appended in a pull request is
refused exactly as the verb would refuse it.

```
ksor takedown --actor <actor> [--instance <path>] [--scope node|subtree]
              --reason <text> [--file-only] <stable_id>
ksor takedown --actor <actor> --revoke <id> | --removed <id> [--reason <text>]
ksor takedown [--instance <path>] (--apply | --list | --ledger)
```

The verb refuses an unnamed actor — and one `takedown_authorities` does not
name (`ksor-takedown-unauthorised`, the same refusal the checker applies to a
hand-appended entry) — before any DSN is resolved. Then, by what the instance
declares: no `database:` → the entry only; `database:` and the DSN present →
the entry, then the row, and a row failure exits `3` naming the entry already
written and `--apply` (idempotent: apply every unapplied entry under its
recorded actor, no `--actor` needed — ingest's step, on demand) as the fix;
`database:` and no DSN → refused (`ksor-takedown-dsn-missing`) unless
`--file-only`. `--reason` is REQUIRED on a denial: `takedown_denylist.reason`
is `NOT NULL`, and the entry is the only place the withdrawal is ever
explained. `--scope subtree` appends the `#section` anchor when the operator
named the bare directory, and refuses one at the default scope. `--list` and
`--ledger` read and need no actor (decision 21). `--export` is removed, with
`.ksor-denylist.json` and the scaffold's `export-denylist` step.

The verb's own argument refusals, each slug-first on stderr and outside the §6
checker set the way the ingest slugs are: `ksor-takedown-unattributed` (no
`--actor`), `ksor-takedown-unauthorised`, `ksor-actor-form`,
`ksor-takedown-unspecified` (no act named), `ksor-takedown-ambiguous` (two),
`ksor-takedown-scope`, `ksor-takedown-unreasoned`, `ksor-takedown-stable-id`,
`ksor-takedown-unknown-entry` (`--revoke`/`--removed` naming no denial),
`ksor-takedown-dsn-missing`.

**How a row lifts.** `takedown_denylist` gains `ledger_id`, `actor`,
`applied_at`, and nullable `revoked_ledger_id` / `revoked_at`; the `DENIED`
seam (`lib/takedown.ts`) denies only rows with `revoked_at IS NULL`. A
denial inserts a row, or — for a stable_id denied, revoked and denied again
— updates the row's `ledger_id` and clears the revocation (the key stays
`stable_id`; the ledger holds the history). A revocation sets
`revoked_ledger_id`/`revoked_at` on the row its `revokes` names. Ingest
applies unapplied entries in ledger order, stores the ledger's id set on the
run, never deletes a row, refuses a file whose id set is not a superset of
the last run's (`ksor-ledger-shrank`), and reports — at every ingest and
every boot, naming the id and the two fixes (merge the entry, or revoke it)
— a row whose ledger id the ingested ledger does not contain
(`ksor-takedown-unmerged`: the verb wrote the row, the pull request was
never merged). The boot gate refuses a row with no ledger id
(`ksor-takedown-unledgered`). The site reads the ledger and applies the same
order. Direction is file → database; the door refuses at once, the site at
its next build from the merged ledger. Change-control verification of ledger
actors (R27 as R22) lands with approvals in plan §4.2.

**Append-only, without a database.** `ksor build` and the emitted checker
compare the ledger against every version of the file reachable in history
(`git log -- .ksor/takedowns.yaml`) and against `build.lock.json`'s committed
`ledger_entries`. Each baseline carries `(id, digest)` — `digest` a sha256 over
every governing field of the entry — so a lost id is `ksor-ledger-shrank` and an
id whose TEXT moved is `ksor-ledger-amended`. Ids alone are not enough: a
committed denial could be RETARGETED in place, keeping its id and its actor,
which republished the denied document and denied an innocent one with nothing
red on any surface. A historic version that does not parse today still counts
for shrink, with no digest. Two baselines and not one, because the LOCK
travels in the same pull request as the ledger and is hand-editable: emptying
both together printed "ok" from a checker that read only the lock. A lock that
does not parse is `ksor-lock-invalid` rather than an empty baseline, which was
the other way to hold nothing. When history is unavailable (a shallow clone)
`ksor build` refuses unless `--allow-unverifiable-ledger` is explicit; the
emitted checker takes no arguments, so it prints `ksor-ledger-unverifiable`
beside its verdict and falls back to the lock alone — a checker that refused
every shallow checkout would be turned off, and silence would be worse than
either. The scaffold's `validate.yml` fetches full depth.

**Dangling.** `ksor-takedown-dangling` applies to in-force (unrevoked)
entries: a `present` `node` entry whose stable_id resolves to no concept,
and a `subtree` entry whose directory no longer exists — a rename of a
denied document goes red instead of republishing. A `removed` entry refuses
when the path **reappears** (`ksor-takedown-readded`).

## 6 · The checker

One rule set, in `packages/content/src/record/`, run by `ksor build` and
`ksor ingest`, and **built** — a second tsdown entry
bundling everything but Node builtins, with a banner carrying the `yaml`
(ISC) and `zod` (MIT) notices — into
the emitted `check.mjs` in both skill copies at package-build time, gitignored
in the templates like `schema/`, with a drift test running the §7 fixture
through the kernel rules and the emitted file. `pnpm check` is read-only and
refuses a stale index; `ksor build` generates the indexes in memory, checks,
and writes only on success. Refusals, each with a stable slug, why, and the
fix: `ksor-frontmatter-invalid` (§2.6 — no closing fence, unparsable YAML,
duplicate key, non-plain tag, second document, non-mapping),
`ksor-missing-key` (`type`/`title`/`description`/`status`),
`ksor-status-unknown`, `ksor-audience-missing`, `ksor-audience-unregistered`,
`ksor-stable-ungenerated`, `ksor-stable-unapproved`,
`ksor-approver-unauthorised`, `ksor-generated-after-approval`,
`ksor-deprecated-unattributed`, `ksor-deprecator-unauthorised`,
`ksor-reserved-type-unsourced`, `ksor-reserved-type-unowned`,
`ksor-source-unresourced`, `ksor-actor-form`, `ksor-instant-form` (a
timestamp that is not an instant with an explicit offset, §2.3),
`ksor-footnote-unkeyed`,
`ksor-reserved-name`, `ksor-index-stale` (check only),
`ksor-attachment-frontmatter` (any key but `type: Summary`),
`ksor-attachment-orphan`, `ksor-link-widens` (a link to a concept whose
audience this document's readers do not reach — and a link to an ASSET whose
NEAREST ANCESTOR DIRECTORY holding any concept holds not one reachable: an
asset declares no audience, so it inherits one by position, and a public
document linking `/secret/chart.png` otherwise published that directory's name
and bytes into the public build. The ancestor walk is what makes the rule
whole — asking only the asset's own directory was defeated by nesting it one
level deeper, `/secret/img/chart.png`, whose directory holds no concept at
all), `ksor-supersession-strands`
(a `deprecated` concept whose `ksor.superseded_by` names a concept that does
not exist, is not `stable`, or fails the widening rule — and the pointer on a
concept that is not `deprecated` at all, which the old checker refused and
which announces a replacement no surface shows),
`ksor-takedown-unauthorised`, `ksor-takedown-dangling`,
`ksor-takedown-readded`, `ksor-ledger-shrank`, `ksor-ledger-amended` (an
entry whose TEXT moved under an id a baseline recorded — comparing id sets
alone let a committed denial be retargeted in place),
`ksor-ledger-invalid`,
`ksor-policy-missing`, `ksor-policy-invalid` (§4: an unknown key in any of
the policy's closed objects included), `ksor-legacy-key` (§2.6),
`ksor-ksor-key-unknown` (a key outside the closed `ksor:` block, §2.7),
`ksor-key-near-miss` (a top-level key one edit from a profile key, §2.7),
`ksor-derived-key` (a concept claiming a key the build writes, §2.7),
`ksor-instance-format` (§3: `format: 2`, the moved keys, a `name` outside
`^[a-z0-9][a-z0-9-]{0,62}$`, a missing `title` or `description`, a key outside
the closed set at any level, a group not written as a block, a non-boolean
`site.governance`), `ksor-migrate-underivable` (migrate only). The hygiene
rules the scaffold's hand-written checker carried, ported so nothing it
refused is accepted silently: `ksor-record-empty` (no concept at all),
`ksor-symlink`, `ksor-name-unportable` (whitespace, `<>:"|?*`, a trailing dot,
a Windows device name, uppercase, non-ASCII, a leading underscore,
parentheses — on files and directories alike), `ksor-name-collides` (two
paths one apart in case; a concept `x.md` beside a directory `x/`),
`ksor-file-type` (`.mdx`, `meta.json`, a YAML that is no companion, anything
but markdown and `png/jpg/jpeg/gif/svg/webp`), `ksor-asset-corrupt` (a PNG
whose signature or chunk CRC fails), `ksor-attachment-near-miss` (`.yml`,
`.json`, `.markdown` one character off a companion), `ksor-link-dead` (a
record-internal link that resolves to no concept, companion, asset,
directory, index or the root), `ksor-link-escapes` (a `..` that climbs out of
`knowledge/`). Unknown frontmatter keys at a concept's own top level are NOT
refused (§2.7) — the one deliberate loosening against the old checker's closed
key set; the `ksor:` block and the policy stay closed. The project
around the record is checked by `pnpm check` alone, not by `ksor build` or
ingest: `ksor-pointer-changed` (`CLAUDE.md` is not exactly `@AGENTS.md`),
`ksor-skill-copy-diverged` (`.agents/skills` and `.claude/skills` differ in
either direction), `ksor-site-holds-content` (a `.md`/`.mdx` inside
`system/site`). Viewer
and lock refusals (`ksor-viewer-omits-public`, `ksor-viewer-unregistered`,
`ksor-lock-missing`, `ksor-lock-stale`, `ksor-site-outdated`) belong to the
site build and the door, not to the record checker (build spec §3).

## 7 · Acceptance

1. A fixture of profile documents — every valid shape in §2 (a mixed-audience
   folder with its committed index included), one document per refusal in
   §5–§6 — is parsed and judged identically by the kernel rules, the emitted
   checker and the site's staging, and each invalid document is refused by
   its slug.
2. `AUDIENCE_CASES` rewritten for overlap keeps every present row's meaning
   (rows 8–11 and 15–16 become refusals), gains a three-tier row and a
   section row; `LIFECYCLE_CASES` exists with a row per line of the §2.5
   table and the build-vs-request boundary row; both assert the SQL through
   real Postgres and the site's copy.
3. A `[public]` staged tree contains no byte of an `[internal]` concept's
   title, path or description — through any index, sidebar, search entry,
   `llms-full.txt` or twin.
4. The generated `index.md` matches a golden fixture in OKF §8 form (and the
   §8 example, vendored, parses as a parse-side golden); the root carries
   `okf_version`; non-root carries no frontmatter; `pnpm check` refuses a
   stale one.
5. `ksor migrate --write` on the current starter and on
   `workbench/example-corpus` (after its three missing descriptions are
   written by hand) produces trees that pass this checker, with every
   `approved` document `draft` unless `--approve-by` was given, a tier
   expanded to every tier at or above it, and every existing denylist row
   present in the ledger. `id`/`name` are deleted; `sor_id`, an escaping or
   stranded `superseded_by`, and a denylist row whose scope or subtree target
   it cannot read are refused (`ksor-migrate-underivable`) rather than
   silently dropped — dropping any of them retires an identity or narrows a
   takedown with nothing recording that it happened.
6. A bare OKF reader with no ksor code reads every non-reserved `.md` under
   the emitted starter's `knowledge/` as a typed concept — `type` (OKF §4.1's
   only always-required key), a `title` to display, a `description` to preview,
   a body, and every `sources` entry naming its `resource` — with the reserved
   root index carrying `okf_version` and nothing else, and a non-root index no
   frontmatter at all. There is no reference `OKFDocument.parse` to run here
   (the spec is vendored, the implementation is not), so the reader is written
   out from the vendored spec in `okf-reader.integration.test.ts` and shares no
   code with `packages/content/src/record`: it splits the fence itself and
   parses YAML with the parser directly. If it ever needs a ksor import to
   pass, that import is the finding.
7. A ledger with a deleted line is refused by `ksor build` (in a repository
   with history) and by ingest; a hand-appended revocation by an unnamed
   actor is refused by check, build and ingest alike; a revocation by a named
   actor lifts the denial on the door within the same ingest and on the site
   at its next build; a later re-denial denies again; a renamed denied
   document is refused; a `removed` path that reappears is refused; a row
   with no ledger id refuses boot; an unmerged row is reported at boot.

## 8 · Out of scope

Import (R26) — demand-gated. `log.md` generation. Scoped takedown
authorities. Attested Computation runtime (P-Attested, experimental).
Changing `stable_id`'s `knowledge/` prefix. A handle→identity map for actor
ids.
