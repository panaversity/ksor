---
status: draft
date: 2026-08-23
claim: the site is the human surface of a governed record, and a reader who cannot get to the point of a long policy does not read it — a summary and a recall deck that are themselves governed artifacts of their document make the record legible without inventing a second, unchecked source
---

# Study attachments — summaries and flashcard decks

A document in `knowledge/` may carry two **attachments**, named after it:

| File                    | What it is                            |
| ----------------------- | ------------------------------------- |
| `<doc>.summary.md`      | a short markdown précis of `<doc>.md` |
| `<doc>.flashcards.yaml` | a recall deck derived from `<doc>.md` |

An attachment is **part of its parent document**, never a document itself. It
has no route, no sidebar entry, no `llms.txt` line, no stable id, and no MCP
node. It inherits its parent's governance entirely.

Ported from the predecessor learn-app under decision 6 (`apps/learn-app`:
`summaries-plugin`, `remark-flashcards`, `components/flashcards`). Two of its
mechanisms were **not** carried and the reasons are recorded in §7.

## Why this is not a docs feature

A KSoR's documents are policy prose. The claim above is the whole
justification: a summary that is a checked-in artifact — reviewed in a PR,
inheriting the parent's tier, withdrawn when the parent is withdrawn — is the
"the ledger wins" argument applied to summarization. The alternative every
other product ships is a model summarizing on demand, which is exactly a
sentence nobody checked.

The deck is the same artifact in interrogative form, and it carries one
constraint the summary does not: **a card may only assert what its parent
asserts** (§6, row 1). A deck that states a fact the parent does not is a
governed claim the MCP door cannot cite and cannot abstain about.

## 1 · The observable contract

### 1.1 Identity and presence

- `C1` An attachment is bound to its parent by filename stem: `x.summary.md`
  and `x.flashcards.yaml` both belong to `x.md` in the same directory.
- `C2` The deck extension is exactly `.flashcards.yaml`. `.yml` is refused by
  name (fumadocs' meta loader accepts `.yaml`/`.json` only and throws
  `Unknown file type` otherwise — verified in `fumadocs-mdx@15.3.0`,
  `dist/meta-BR_rkCyY.js`).
- `C3` **Presence-driven.** No attachment beside a document ⇒ no summary tab
  and no deck on that page, and no affordance hinting at one.
- `C4` An attachment with no parent document is **refused**, never skipped —
  by `pnpm check` with a remedy, and independently by the build
  (`ksor-attachment-orphan`), because staging never depends on the checker
  having run.

### 1.2 Negative promises — an attachment is not a document

Each is separately observable on the built output:

- `C5` No route: `out/docs/<x>.summary/index.html` does not exist.
- `C6` No sidebar entry.
- `C7` No `llms.txt` line and no `llms-full.txt` body.
- `C8` No `/md/<x>.summary.md` route.
- `C9` Not in the search index.
- `C10` The parent's own `/md/` bytes and `llms-full.txt` body are
  **byte-unchanged** by the presence of an attachment.
- `C11` No stable id: `ksor ingest` does not create a `content_nodes` row for
  an attachment, so it is never independently citable and never an MCP node.

### 1.3 Governance inheritance

- `C12` An attachment's audience tier is its **parent's**, never its own and
  never `default_visibility`. A restricted parent's attachments are absent
  from a wider build.
- `C13` An attachment declaring **any frontmatter** is refused
  (`ksor-attachment-frontmatter`). Broader than "refuse `visibility:`", and
  deliberately: one rule closes `visibility:` widening, `sor_id:` takedown
  escape, and `status:`/`owner:`/`provenance:` claiming governance a thing with
  no id cannot carry — where a per-key allowlist would re-open the argument for
  every future key.
- `C14` Takedown denial is evaluated on the **parent's** stable id (honouring
  a parent `sor_id:` override) and on the attachment's own record path for the
  subtree arm. A denied parent takes its attachments with it.
- `C15` `site.governance: false` does **not** hide attachments. A summary is
  content, not governance furniture.

### 1.4 The summary surface

- `C16` A document with a summary renders two tabs — the record's own words
  first, the summary second. Without one, no tab strip renders at all. The tabs
  are the two READINGS of a document; what a reader DOES with it lives at the
  end of the page (§1.5).
- `C17` The summary renders through the same MDX pipeline as the record, so
  it carries the same prose voice, code handling and heading anchors.
- `C18` Tabs are a real WAI-ARIA tablist: `role="tablist"`/`role="tab"`/
  `role="tabpanel"`, `aria-selected`, `aria-controls`, roving `tabIndex`, and
  Left/Right/Home/End keys.
- `C19` The tab state is in the URL fragment, so a summary is linkable.
- `C19a` Each document shows how long it takes to read, **under its
  description** rather than on the facts row. That row is what the record
  DECLARES — every entry an author wrote and a reviewer checked — and this is
  derived from the document's own words and declared by nobody. It therefore
  also survives `site.governance: false`, which removes the facts row
  wholesale: a record that publishes no governance still takes three minutes to
  read.

  Counted at BUILD time so the figure is in the shipped HTML — a reader with a
  failed bundle, a crawler and an agent all get it. Fenced code and frontmatter
  are excluded: a short page with a long code block is not a twenty-minute
  read. Where a summary exists, each tab carries its own figure, which is what
  makes the summary's value legible without a word of copy.

- `C20` **The inactive panel is present in the server-rendered HTML**, not
  mounted on click — an agent parsing the page and a reader with JavaScript
  off both get both texts.

### 1.5 The deck surface

- `C21a` The deck renders at the **end of the document**, never behind a tab: a
  study aid is used AFTER reading, and a tab hides the document while you use
  it. It sits in ONE end-of-document region (`components/study-aids.tsx`) that
  the quiz will share, so a second aid is a child there rather than a new
  argument about placement. The region renders nothing when a document has no
  aids.
- `C21` The deck is ordered by **what is due**, not by authored order. This is
  the mechanism the predecessor computed and discarded (§7 A).
- `C22` Two grades — _Missed it_ / _Got it_ — matching what the UI exposes.
- `C23` Review state persists per deck in `localStorage` under
  `ksor:flashcards:<record>:<deck-path>`; a browser that refuses storage
  degrades to an unscheduled walk rather than failing.
- `C24` **Per-card content hash.** A card whose text changed resets **that
  card**, and the deck says so accurately. Progress on untouched cards
  survives. No deck-wide version key (§7 B).
- `C25` Keyboard, on the deck: Space/Enter reveals and hides, `1` and `2`
  grade, `←`/`→` step between cards without grading. On the tab strip: `←`/`→`
  cycle, `Home`/`End` jump, with a roving `tabIndex` so the strip is one tab
  stop rather than two. Every control is reachable and shows focus.

  `Esc` is NOT built and should not be: there is nothing modal to exit — the
  deck is a section of the page, and scrolling leaves it.

- `C29` Deck actions: **Shuffle** walks the whole deck in random order,
  **Guide** discloses how the card and the schedule work, **Download** exports
  tab-separated front/back — the shape Anki and most other tools import, built
  in the browser rather than written to disk beside the record.

- `C26` The scheduler is a pure function `(CardSchedule, Rating, now) →
CardSchedule` — no React, no storage, no ambient clock.

### 1.6 Naming the scheduler honestly

- `C27` `SCHEDULER_POLICY = "ksor-sm2-v1"`, persisted with the state. It is a
  two-grade SM-2 variant. It is **not** FSRS, and no surface, comment or doc
  claims a retention target. The ladder: a missed card returns in about a
  minute; a recalled card's interval grows ~2.5× each time.

## 2 · Where each rule lives

| Rule                             | Home                                                  |
| -------------------------------- | ----------------------------------------------------- |
| what an attachment _is_          | `lib/attachment-rule.ts` — ONE canonical file, copied |
| refusal with a remedy            | `check.mjs` (both skill copies)                       |
| tier + denial inheritance        | `lib/stage-knowledge.ts` `planStage`                  |
| not-a-document, on every surface | `source.config.ts` — the `files` globs                |
| not an MCP node                  | `packages/content/.../plain-tree.ts` `isDoc`          |
| scheduling                       | `lib/srs.ts` — pure                                   |

The attachment rule is duplicated between the kernel (`isDoc`) and the site
(`check.mjs`, staging, the globs), which is the precise shape decision 18
names. It therefore lands as ONE canonical rule with a drift test, exactly as
`audience-rule.ts` / `denial-rule.ts` / `order-rule.ts` already do.

## 3 · Why one exclusion, and not five

The route table, the sidebar, `llms.txt`, `llms-full.txt`, `/md/`, the search
index and `caveatStatusByUrl` all read `source`, and `source` is
`loader({ source: docs.toFumadocsSource() })` — one collection. Excluding
attachments from _that_ collection satisfies `C5`–`C9` at once. Every
alternative leaves the file inside the collection and subtracts it per
surface, which is the failure mode `research/visibility.md` §4–§5 is cited
for. Pruning the page tree is not sufficient: `getSortedPages()` deliberately
re-adds what the tree dropped, and the search index never consults the tree.

The existing `meta` collection's glob must be **pinned** to `meta.{json,yaml}`
in the same change, or a deck lands in it and fails the build with a zod error
naming neither the file's purpose nor the rule.

## 4 · Acceptance

1. `ksor init` emits a record whose seed document carries a summary and a
   deck; `pnpm dev` renders both with no database and no key.
2. A `.summary.md` beside a document produces a tab strip and a
   `.flashcards.yaml` produces a deck at the end of the page; removing either
   removes it and leaves no trace, and removing both leaves no region at all.
3. `grep` over `out/` finds the summary's text on the parent's page and
   **nowhere else** — no route, no `llms.txt`, no search index, no `/md/`.
4. The parent's `/md/` bytes are identical with and without attachments.
5. A restricted parent's summary text appears in **no** file of a public
   build, against a positive control proving the sweep is not blind.
6. A denied parent's attachments are absent.
7. An orphan attachment fails `pnpm check` with a remedy, and fails the build.
8. `ksor ingest` creates no node for either attachment.
9. Both shells refuse to publish an attachment as a routed document.
10. The scheduler's transition table is asserted for every state × rating pair
    against a frozen clock.
11. A real browser: both themes, both tabs, the deck at the end of the page, a
    full grade cycle, reload persistence, zero console errors, zero external
    requests.

## 5 · Out of scope

- The MCP door serving summaries or decks as retrievable content. Ingest is
  touched **only** to stop attachments becoming nodes (`C11`).
- Cross-device or server-side review state. `localStorage` is per browser.
- Citation pinning of a summary. Site pages carry no generation today; a
  summary makes that pre-existing gap conspicuous but does not change it.
- Anki export, auth gating, translation seeding — see §7.
- **Hiding a card's answer.** The deck reaches the browser as a prop, so every
  card's back is in the page bytes whatever the reveal state (verified: card
  text greps out of the built `index.html`). Flip is a reading affordance, not
  a secrecy boundary, and nothing here should be read as one — a fact a reader
  may not see belongs behind `visibility:`, not behind a button.

## 6 · Known asymmetries, stated rather than hidden

1. **A deck is site-only.** The door does not serve it. Benign **only** under
   `C28`: a card may assert nothing its parent does not. Unenforceable by
   machine; stated in the scaffold's authoring rules and reviewable in a PR.
2. **A summary is site-only.** Same constraint, same reasoning. The parent is
   what the door serves and what a citation resolves to.
3. **Authoring leaks are bounded, not solved** — a card quoting a
   more-restricted document is the same class as the existing cross-tier link
   rule, and no single build sees both ends.

## 7 · What was not carried, and why

- **A** The predecessor's spaced repetition is **write-only**: `useFSRS`
  computes a due queue (`useFSRS.ts:253-256`) that `Flashcards.tsx` never
  reads, walking `deck.cards` in authored order instead. `C21` makes the queue
  real, so it is **new** behaviour, not ported behaviour.
- **B** The predecessor's deck-version reset does **not** exist — it logs
  (`useFSRS.ts:177-182`) — and the toast it raises says progress "was reset due
  to a deck update" while firing only from the `JSON.parse` catch, i.e.
  storage corruption. `C24` replaces both with a per-card content hash that is
  true.
- **C** `ts-fsrs`: rejected by the owner. `C27` names what replaced it.
- **D** Auth gating (`ContentGate`), Anki export, the translation seed, and
  the progress API: no analogue here. The scaffold has no auth, and
  "publication, not authorship" already governs who reads the record.
