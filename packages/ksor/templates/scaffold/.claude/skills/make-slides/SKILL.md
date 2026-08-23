---
name: make-slides
description: Generate a presentation from one document and attach it, so it renders on that document's page. Use when the owner says "make slides for X", "turn this into a deck", "I need to present this", asks for a teaching aid or a slideshow, or when onboarding needs a session rather than a page.
metadata:
  version: "2.0.0"
---

# Generating a presentation for a document

You write the slides. Not an outline for somebody else to build — the actual
deck, into `<doc>.slides.yaml`, which the site renders on that document's page.
No browser, no third-party tool, no step where a human takes over.

Run it end to end: read the document, write the deck, check every line back
against the document, verify it builds. **The check is not optional** — it is
the step that keeps the record's guarantee true.

## The one rule everything else serves

**A slide may only say what the document says.**

The deck is a way of presenting the record, never a second source. A slide
asserting a threshold the document does not contain is a claim nothing governs
and no agent can cite — and because the deck is an attachment, the record now
stands behind it. Every number, date, name and rule is copied from the
document exactly, units included.

If the document does not say something you want on a slide, there are two
honest options: leave it out, or tell the owner the document is missing it.
Never a third.

## 1 · Read the document whole, first

Read `<doc>.md` completely before writing anything. Note as you go:

- **the decision it settles** — the reason it exists
- **the rule, in its own words** — usually one or two sentences
- **the numbers** — thresholds, deadlines, limits, and their units
- **the cases** — what happens in each situation it names
- **the boundary** — what it explicitly does NOT cover
- **its governance** — `owner`, `effective`, `status` from the frontmatter

If the document carries `<doc>.summary.md`, read that too: it is a reviewed
compression of the same thing, and it tells you what the author thought was
load-bearing.

## 2 · Write the deck

Write `<doc>.slides.yaml` beside the document:

```yaml
slides:
  title: Expense approvals
  description: The 15-minute version, for a room.
deck:
  - heading: What this settles
    lead: One sentence, in the document's own words.
    note: What to say here. Spoken, never shown.

  - heading: The rule
    bullets:
      - Two approvers above the threshold, always
      - The threshold is per invoice, including tax
    note: Pause here. This is the slide people remember wrong.
```

**Per slide:**

| Field     | Use                                                          |
| --------- | ------------------------------------------------------------ |
| `heading` | required — a statement, not a label. "The rule", not "Rules" |
| `lead`    | one sentence, for a slide making a single point              |
| `bullets` | three to five. Six is the cap, and six is already too many   |
| `note`    | what the presenter SAYS — never a repeat of the slide        |

**Per deck** — 8 to 14 slides for an ordinary policy document:

1. What this settles, and for whom
2. Why it exists — the decision behind it
3. The rule itself, stated once
4. One slide per case, with the real numbers
5. What people get wrong, and what is true instead
6. The boundary — what this document does not cover
7. Where to find it: the route, the owner, the effective date

**Habits that decide whether it is any good:**

- **A heading is a claim.** "Recency is not authority" teaches; "Authority"
  does not.
- **A bullet is one thought.** If it needs a comma splice, it is two bullets.
- **The note carries the argument.** The slide holds the shape; the presenter
  holds the reasoning. A note repeating the bullets is a wasted field.
- **Do not pad to a target.** Five slides of substance beat twelve with three
  that exist to reach twelve.

## 3 · Check every line against the document

Go back through slide by slide with the document open. For each:

- Is every claim in the document? Name where.
- Is every number identical, same units, same rounding?
- Does any slide imply a rule the document does not state?
- Does the boundary slide match what the document actually excludes?

This pass finds real errors, reliably. A transcription slip in a deck outlives
the session it was made for, because the next presenter trusts it.

## 4 · Verify it

```sh
pnpm check     # refuses an orphan, frontmatter, or a malformed deck
pnpm dev       # look at the page — the deck renders at the end
```

`pnpm build` refuses:

- `ksor-slides-empty` — neither `deck:` nor `slides.url:`; nothing to show
- `ksor-slides-two-sources` — both, so nothing says which one governs
- `ksor-attachment-orphan` — no `<doc>.md` beside it
- `ksor-attachment-frontmatter` — an attachment carries none of its own

## 5 · Tell the owner what you did

Which document, how many slides, and **anything you left out because the
document did not support it**. That last part is the useful half: it is how an
owner finds out their document has a gap.

## Embedding a deck made elsewhere

If the owner already has a deck in Google Slides, Canva or SlideShare, use the
linked mode — `slides.url:` and no `deck:`:

```yaml
slides:
  title: Expense approvals
  url: https://docs.google.com/presentation/d/<id>/edit?usp=sharing
```

The embed url is derived for those three providers; for anything else add
`embed:` explicitly or it renders as a link. `url` must be https — a browser
blocks a mixed-content frame silently, so an http one publishes a panel that
never loads.

**Prefer the record-owned deck.** A linked deck is not reviewed in a pull
request, not versioned with its document, not withdrawn when the document is,
and can rot to a dead link with nothing going red. Use the link when the deck
already exists and somebody else maintains it — not as the default.

## What NOT to do

- **Do not put the deck in the document.** No `<iframe>`, no raw HTML.
  `knowledge/` is CommonMark and must read cleanly in any markdown viewer.
- **Do not write a slide the document cannot support**, even a true one. If it
  is not in the record, the record cannot stand behind it.
- **Do not make one deck for several documents.** A deck belongs to one
  document, the way a summary does. A deck spanning five policies has no
  document to be governed by and nothing to be withdrawn with.
- **Do not patch a stale deck.** When the document changes materially,
  regenerate from it. Patching is how a deck and its document drift, and a
  deck that drifts starts winning arguments it should lose.
