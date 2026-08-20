---
status: draft
date: 2026-08-20
claim: whether an agent — or a reader — can be trusted is decided by the governance of what it reads, so the governance a document carries must be visible on the surface that serves it
evidence: panaversity/ksor#29
---

# Site governance rendering

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
- **`llms.txt` and the per-page markdown artifacts are unchanged** — the
  markdown artifact already carries the document's own frontmatter.

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
   page, an `approved` document renders no status chip while still showing
   what it declared, and a document declaring only `title` + `status: draft`
   renders that caveat and no other governance furniture.
3. **Browser smoke** — the existing both-themes, zero-console-error walk
   covers the new furniture; the successor link is clicked and lands.
4. **Positive control** — the assertions fail against the current build.
   A test that cannot go red proves nothing.

## Out of scope

- **Per-document visibility / audience tier** — interacts with the visibility
  staging sweeps and gets its own decision.
- **Generations and `build.lock.json`** — a generation is a serve-side and
  `ksor build` concept; a static site build has no access to one. The
  citation pin stays unrendered until `ksor build` emits the record.
- **Governed directives** (`:::quiz` and friends) — no grammar ratified
  (panaversity/ksor#35).
- **The typography / layout / identity pass** — the other half of
  panaversity/ksor#29.
