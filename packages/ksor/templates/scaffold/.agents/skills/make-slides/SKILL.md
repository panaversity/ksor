---
name: make-slides
description: Build a presentation that teaches one document, then attach it so it renders on that document's page. Use when the owner asks for slides, a deck, a presentation, a teaching aid, or something to present a policy from — or when onboarding needs a session rather than a page.
metadata:
  version: "1.0.0"
---

# Making a presentation for a document

A document can carry a deck: `<doc>.slides.yaml` beside `<doc>.md`. It renders
at the end of that document's page as **the presentation that teaches it** — a
link out, and a frame the reader loads on click.

This skill is the whole procedure: what to put in the deck, how to build it,
and how to attach it. Two rules govern all of it.

**A slide may only say what the document says.** The deck is a way of
presenting the record, never a second source. A slide asserting a threshold the
document does not contain is a claim nothing governs and no agent can cite. Every
number, date and rule comes from the document, copied exactly.

**The document is the source, the deck is a rendering.** When the document
changes, the deck is stale. Rebuild it from the document rather than patching
the slides, or the two drift and the deck starts winning arguments it should
lose.

## 1 · Decide whether a deck is the right thing

Do not make one by default. A deck earns its place when the document will be
**presented to a room** — onboarding, an induction, a handover session. If the
answer is "someone will read this at their desk", the summary and the quiz
already serve that better, and a deck is work nobody asked for.

## 2 · Write the outline FIRST, from the document

Before opening any slide tool, write the outline as plain text and check it
against the document line by line. This is the step that decides quality, and
it is the step a tool will happily skip for you.

A working shape for a policy document, 8–14 slides:

| Slides | What                                                                      |
| ------ | ------------------------------------------------------------------------- |
| 1      | Title: the document's own title, and what the record is authoritative for |
| 2      | Why this exists — the decision this document settles                      |
| 3–4    | The rule itself, stated once, in the document's own words                 |
| 5–8    | One slide per case that comes up, with the actual thresholds              |
| 9–10   | What people get wrong, and what is true instead                           |
| 11     | Where the edges are — what this document does NOT cover                   |
| 12     | Where to find it: the document's URL, its owner, its effective date       |

Two habits worth keeping:

- **Three to five lines a slide.** A slide someone reads aloud is a slide
  nobody listens to.
- **Name the boundary.** Slide 11 is the one people remember, because it is the
  one that tells them when to go and ask.

If the document already carries a `<doc>.teaching.yaml`, read it first: its
`key_points` and `misconceptions` are the outline's spine, already written and
already reviewed.

## 3 · Build the deck

Any tool that produces a shareable https link works — the record does not care
which, and naming one here would make it a dependency it is not. What matters
is that the deck is **shareable and embeddable**, because a link only you can
open publishes a broken panel to everyone else.

Whatever you use: paste the outline from step 2 rather than asking the tool to
read the document. The outline is the reviewed artifact; the document may be
long, and a tool summarising it unattended is exactly how a slide gains a claim
the document never made.

Then check the deck against the document once more, slide by slide, before
attaching it. Numbers and dates especially — a transcription error in a deck
outlives the session.

## 4 · Attach it

Write `<doc>.slides.yaml` beside the document:

```yaml
slides:
  title: Expense approvals
  description: The 20-minute version, for a room.
  url: https://docs.google.com/presentation/d/<id>/edit?usp=sharing
```

That is usually all of it. Rules worth knowing:

- **`url` must be https.** A browser blocks an http frame on a secure page as
  mixed content, so `pnpm check` refuses one rather than publishing a panel
  that silently never loads.
- **`embed:` is optional.** For a provider whose embed url can be derived —
  Google Slides, Canva, SlideShare — leave it out. For anything else, paste the
  provider's own embed url, or the deck renders as a link with no frame and
  `pnpm build` tells you so.
- **No frontmatter, no `id:`.** It is an attachment: the path is its identity.
- **It inherits the document's tier and takedown.** Restrict the document and
  the deck goes with it. There is no way to attach a private deck to a public
  document — if you need that, the deck belongs in a second record.

Then:

```sh
pnpm check     # the rules above, as a program
pnpm dev       # look at the page
```

## 5 · What the reader gets

A link out, always. And a frame that loads **on click**, not on page load —
because the site guarantees a page makes no external requests, and because a
reader who only wanted the policy should not have to announce that to a slide
host. Say that out loud if someone asks why the deck is not already showing:
it is deliberate, not a bug.

## What NOT to do

- **Do not put the deck in the document.** No `<iframe>`, no raw HTML.
  `knowledge/` is CommonMark and must read cleanly in any markdown viewer.
- **Do not attach a deck you have not checked against the document.** The
  attachment inherits the document's governance, which means the record now
  stands behind those slides.
- **Do not make one deck for several documents.** A deck belongs to one
  document, the way a summary does. A deck spanning five policies has no
  document to be governed by, and nothing to be withdrawn with.
