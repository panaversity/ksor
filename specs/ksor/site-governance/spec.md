---
status: superseded
date: 2026-08-20
claim: whether an agent — or a reader — can be trusted is decided by the governance of what it reads, so the governance a document carries must be visible on the surface that serves it
evidence: panaversity/ksor#29
---

# Site governance rendering

> **Status set to `superseded`, 2026-09-02.** The note below already named
> the record and build specs as the contract; this walk confirmed that the
> acceptance below cannot pass against the tree — its fixtures
> (`status: approved`, `status: superseded`, a bare `effective` date) are
> shapes the checker refuses (`ksor-status-unknown`, `ksor-instant-form`) —
> so the honest lifecycle word is the third one guard rule 8 admits. The
> reasoning stays, as the note says.
>
> **Superseded in part, 2026-08-25.** This page was written against the ranked
> `visibility:` model and the `draft | review | approved | superseded` status
> vocabulary. The record is now the KSoR Profile of OKF: the lifecycle states
> are `draft | stable | deprecated`, the audience is a LIST that overlaps a
> viewer's list, and which surface may publish which state is record spec
> §2.5's table. **`specs/ksor/record/spec.md` §2 and `specs/ksor/build/spec.md`
> §3 are the contract**; what survives here unchanged is the _reasoning_ — why
> the governance a document carries must be visible on the surface that serves
> it, and why `site.governance` decides the pages and never the agent files.
>
> **Everything below the reasoning is history**, not only the key-by-key
> tables — the "observable contract" section names the same retired keys in
> prose, and its acceptance clauses describe fixtures the checker now refuses
> to build (`status: approved`, `status: superseded`). Read in order, the
> mapping is: `owner` → `ksor.owner`; `provenance` → `sources[]`, each entry
> naming a `resource`; `effective` → `ksor.effective_from`; `superseded_by` →
> `ksor.superseded_by` beside `status: deprecated`; and `ALLOWED_KEYS` →
> nothing, because a concept's own top level is OPEN now (record spec §2.7).
> One subsection inverts completely rather than moving: "`effective` is a
> date, or it is quoted text", which instructs an author to write a bare
> `YYYY-MM-DD` — the one shape `ksor-instant-form` refuses. Every timestamp
> is an ISO 8601 instant with an explicit offset.

The record carries a governance vocabulary on every document and `pnpm check`
enforces it. The site parses four of those keys and renders none of them.
Where this spec and the code disagree, the code wins and this page is
corrected in the same commit.

## What the record already says, and the site already discards

`ALLOWED_KEYS` (format-checker) governs eleven keys. `title`, `description`
and `order` reach the reader. These do not:

| Key             | What the record means by it                                                                                                           | Rendered today |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `status`        | where the document sits in the governance lifecycle — `draft` / `review` / `approved` / `superseded`. **Required on every document.** | no             |
| `owner`         | who stands behind it                                                                                                                  | no             |
| `provenance`    | the sources it came from — **a list**, one entry per source, so a citation can point at exactly one of them                           | no             |
| `effective`     | when it took effect                                                                                                                   | no             |
| `superseded_by` | its successor — **required** when `status: superseded`, validated to resolve inside `knowledge/`                                      | no             |

`source.config.ts` already parses `status`, `owner`, `provenance` and
`superseded_by` into page data and throws them away; the comment there records
them as "tolerated … so a governed document always renders".

## Why this is not only a presentation gap

1. **A superseded document is served as if it were current.** The checker
   demands a successor pointer precisely so the supersession survives into
   every surface; the page swallows it. "Superseded documents are marked,
   never deleted" is true of the record and false of the page a human reads.
   This clause is a correctness fix, not a design improvement.
2. **Provenance is load-bearing** (product principle 6). A list whose stated
   purpose is that citations can point at exactly one entry is worth nothing
   while no surface shows the entries.
3. **One source, two surfaces** (product principle 2) — the MCP surface
   answers with provenance and the website does not. Two surfaces, two
   truths.
4. A reader cannot distinguish a `draft` from an `approved` document, which
   is the single cheapest governance signal the ladder offers at level 0.

## The observable contract

`status` renders **only when it is a caveat** — `draft`, `review`,
`superseded`. An `approved` document shows no chip, because that is what a
reader already assumes of a document in a system of record; a label that
appears on every page and always says the same thing carries no information,
and a reader who learns to ignore it will also ignore it on the page where it
matters. _(Revision 2026-08-20, owner: this clause first read "every document
renders it". Reversed on the ladder argument — a level-0 record where every
document is `draft` would carry governance furniture on every page, which is
level-4 dress on a level-0 project.)_

The rest render **only when the document declares them**: `owner`; every
`provenance` entry, each separately visible; `effective`; and `superseded_by`
**as a working link to the successor's rendered page**.

Suppression is a **presentation** decision and lives in the component. The
projection keeps reporting the record faithfully — it never hides what a
document declared.

A document with `status: superseded` carries an unmistakable marker naming
its successor. A reader must not have to notice a subtle badge to learn that
what they are reading has been replaced.

### The publication switch

`site.governance` in instance.md, **default on**:

```yaml
site:
  governance: false
```

A record often wants `owner:` and `provenance:` filled in for the agent
surface and the audit trail while the published page stays plain — the data
is governance, the display is publication. Per-document control already
exists (declare a key and it shows; leave it off and nothing does), so this
key answers the other question: whether the site publishes what the record
declares.

Off hides the status/owner/effective strip and the sources list. It **never**
hides the supersession notice: that is a correctness warning, not decoration,
and a reader handed a replaced document with no word of its successor has been
misled whatever the site's preferences are.

It never hides the **lifecycle badge** either, and for the same reason: the
chip that says a document is a draft, is not in force yet, or is past its
review date (record spec §2.5) is a caveat, not an attribution. The sidebar
row, the folder listing and the search result for that same document carry it
whatever this key says, and the MCP door declines the document outright — so
the page staying silent had one record speaking with two voices about one
document, and the reader who opened it got the only surface that said nothing
(2026-08-25 review). `deprecated` is the one state the page does not repeat as
a chip, because the notice above the title is already saying it.

It also never reaches the **agent** files. `llms.txt` and `llms-full.txt` carry
the governance whatever this key says: it is a decision about what the published
PAGES show, and the record keeps every key for the agent surface and the audit
trail — the sentence this key's own rationale opens with. Suppressing them here
would hand a consumer a withdrawn document as clean prose, which is the defect,
not the preference.

A value that is neither `true` nor `false` is refused — by `pnpm check` and by
the build. Defaulting silently would publish the governance the owner asked to
hide, or hide what they asked to publish.

### `effective` is a date, or it is quoted text

Unquoted, `effective` must be a **calendar-valid `YYYY-MM-DD`**. Anything else
must be quoted, and quoted text is published verbatim, never parsed as a date.

This is narrower than the key started out, and deliberately so — it is the
third revision. Every wider rule leaked a different way for the page to state a
day the record never wrote: `2026-06-31` rolls to July 1st (YAML's date path
builds a `Date` with no calendar validation), a value carrying a time reads back
in a timezone and can land a day early, a wrapped value is invisible to the
checker's line-based parser, and a bare `2026` types as a number that never
reached the page at all. The page publishes this value inside `<time datetime>`
as machine-readable fact, so a shape whose meaning depends on the reader's
timezone or on YAML's rollover behaviour cannot be allowed through.

### Negative promises

- **Nothing is inferred, defaulted or synthesized.** An absent `owner`
  renders nothing — never "unknown", never a placeholder. An invented
  governance value is worse than a missing one, because it reads as governed.
- **No new authored content** — surface-contract clause 2 stands: the shell
  renders the record and nothing authored inside itself.
- **No second identity.** Governance rendering introduces no `id:`/`name:`
  and derives every route from the path (product principle 3).
- **Degrades everywhere**: static export, no JavaScript, and print. No
  governance fact may exist only inside an interactive control.
- ~~**`llms.txt` and the per-page markdown artifacts are unchanged** — the
  markdown artifact already carries the document's own frontmatter.~~
  _Revision 2026-08-21 (code wins): the first half is **reversed**. This clause
  rested on a premise that was false in the build — the per-page markdown
  artifact does not exist yet, so nothing carried the frontmatter, and `llms.txt`
  listed a withdrawn document beside its replacement with no way to tell them
  apart. Scoping governance to the HTML page therefore did not leave the agent
  surface untouched; it left it **wrong**, which breaks product principle 2
  (one source, two surfaces, never two truths). `llms.txt` now carries a caveat
  status and the successor's resolved route, and `llms-full.txt` carries each
  document's governance as frontmatter — the record's own grammar. Measured
  before and after on shipped bytes: `research/site-design.md` F1. The per-page
  markdown artifact stays out of scope (F2), and the parenthetical about it
  becomes true the day `ksor build` emits one._ _Revision 2026-08-25 (decision
  27): that day arrived. The twin exists at `/md/`, and it serves the concept's
  own frontmatter intact — nested `ksor:` and all — under the derived
  `trust_tier` and the build's `build_id`, `source_commit` and `ksor_version`,
  so an OKF consumer parses the profile's grammar rather than this shell's
  summary of it. The caveat markers this clause added to `llms.txt` are
  retired with it: a deprecated, not-yet-effective or stale concept is now
  ABSENT from the machine surfaces entirely (record spec §2.5), which is the
  profile's answer to the same defect._

## Where it binds: the Fumadocs reference shell

This lands in the shell core ships (`system/site/`, decision 9) and **not** as
a clause of the pinned surface contract.

That is a deliberate narrowing, recorded because the alternative was drafted
first: binding it as surface-contract clause 6 on the clause-5 precedent —
visibility is specified once and conformance-tested against both shells
because it is a product guarantee rather than chrome — would have obliged the
Docusaurus conformance shell to implement it too. **Set aside by the owner
(2026-08-20)**: that shell is explicitly "never feature parity", and the
governance a reader sees is presentation of data the record already carries,
not a promise a shell swap can violate silently the way a visibility leak can.

What that costs, stated plainly so nobody rediscovers it as a surprise: a
project that swaps shells loses governance rendering until its shell adds it,
and no conformance suite will say so. Reversed — promoted to a contract clause
— if a second shell ever ships to adopters, or if the swap recipe starts being
used for anything but conformance.

_Extended 2026-08-21:_ the same narrowing now covers the **agent files**. The
Fumadocs shell's `llms.txt` marks a caveat status and `llms-full.txt` carries
each document's governance; the conformance shell's do neither, so the two
shells' agent files legitimately differ and the suite passes both — it asserts
the surface contract (the instance name, the canonical reading order, every link
resolving), not this. Worth weighing harder than the page half if the promotion
question is reopened: a reader who loses the page's notice still sees a
document; a consumer who loses the file's frontmatter gets a withdrawn policy as
clean prose and cannot tell.

## Acceptance

Red first, in this order:

1. **Unit** — the governance projection from page data: present keys in,
   rendered values out; absent keys yield nothing; `provenance` of one entry
   and of many; blank and whitespace-only values treated as absent; a
   `superseded` document without `superseded_by` (which the checker refuses,
   so the shell fails the build loudly rather than render a dangling
   supersession — defense in depth for the adopter who skipped `pnpm check`).
2. **Integration, against a built scaffold** — a fixture record with one
   document per governance shape (bare `draft`; fully-populated `approved`; a
   `superseded` document pointing at its successor). Assert the built HTML
   carries every declared value, the successor link resolves to a real built
   page, `site: governance: false` leaves the pages plain while the
   supersession notice survives it, an `approved` document renders no status
   chip while still showing
   what it declared, and a document declaring only `title` + `status: draft`
   renders that caveat and no other governance furniture.
3. **Browser smoke** — the existing both-themes, zero-console-error walk
   covers the new furniture; the successor link is clicked and lands.
4. **Positive control** — the assertions fail against the current build.
   A test that cannot go red proves nothing.

## Out of scope

- **Per-document visibility / audience tier** — interacts with the visibility
  staging sweeps and gets its own decision.
- ~~**Generations and `build.lock.json`** — a generation is a serve-side and
  `ksor build` concept; a static site build has no access to one. The
  citation pin stays unrendered until `ksor build` emits the record.~~
  _Revision 2026-08-25 (decision 27, code wins): half reversed. The static
  site build now REQUIRES `build.lock.json` — it refuses `ksor-lock-missing` /
  `ksor-lock-stale` outside development — and stamps the lock's `build_id`,
  `source_commit` and `ksor_version` into `llms.txt`, `llms-full.txt`, every
  twin and `server.json`. What stays true is the distinction: `build_id` is
  not a `generation`, and the generation a citation pins remains the kernel's
  counter, which a static build still has no access to._
- **Governed directives** (`:::quiz` and friends) — no grammar ratified
  (panaversity/ksor#35).
- **The typography / layout / identity pass** — the other half of
  panaversity/ksor#29.
