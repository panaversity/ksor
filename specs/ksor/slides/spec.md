---
status: draft
date: 2026-08-24
claim: a record is adopted by being presented — onboarding, induction, handover — and a deck built outside the record is the one artifact about a document that nobody reviews, nobody versions with it, and nobody withdraws when it is withdrawn
---

# Presentations

A document in `knowledge/` may carry a fifth **attachment**, named after it:

| File                | What it is                             |
| ------------------- | -------------------------------------- |
| `<doc>.slides.yaml` | a presentation that teaches `<doc>.md` |

Everything the study-attachments spec says holds: no route, no sidebar entry,
no `llms.txt` line, no markdown twin, no search entry, no stable id, no MCP
node, no frontmatter of its own, and its parent's governance entirely.
_Corrected 2026-08-25: "unchanged" was the wrong word to delegate with. The
companion frontmatter rule reversed for ONE kind on 2026-08-25 — a
`<doc>.summary.md` must now carry exactly `type: Summary` — and that spec's
`C12`/`C13`/`C14` are corrected there. For a `.slides.yaml` the no-frontmatter
clause is unaffected: a YAML companion declares nothing._

Ported from the predecessor's **Teaching Aid** — a `## 📚 Teaching Aid`
heading, a `:::tip` with a share link, and a raw `<div>`/`<iframe>` to Google
Slides authored inline in the lesson's MDX
(`specs/crashcourses/connector-native-apps/…md`). Both halves of that changed,
and §3 says why.

## 1 · Two sources, and which one is the default

**`deck:` — the record owns the slides.** Headings, bullets and presenter
notes in the attachment; the site renders the presentation. This is the
default, and the reason is governance rather than convenience: a deck here is
reviewed in the same pull request as its document, versioned with it, withdrawn
when it is withdrawn, and cannot rot into a dead link because there is no link.

**`slides.url:` — a deck hosted elsewhere.** For an adopter who already keeps
one in Google Slides, Canva or SlideShare — the providers whose share url the
site can turn into an embed url. Any other host needs an explicit `embed:`
url beside it, or the build refuses `ksor-slides-no-embed`
(`system/site/lib/slides.ts:106-119`): a linked deck is meant to be shown,
and a link that frames nothing is the kind of quiet failure an author would
not notice. It is a real mode and it is not the
default, because an embedded deck is exactly the artifact this product exists
to eliminate: a second copy, unreviewed, that can disagree with the record and
win.

**Declaring both is refused** — `ksor-slides-two-sources`. Two presentations
with nothing to say which governs is the disagreement a system of record
exists to settle, and admitting it here would undercut the whole claim.

## 2 · Placement, and why it is not with the other aids

The deck renders **after the document's introduction** — everything before its
first `##` section — and before that heading; in a document with no sections it
follows the prose. Alone among the attachments, it is above the body rather
than after it. _Corrected 2026-08-25: this read "at the top of the document's
page, before the prose", which is where it shipped and where it no longer is
(released in 0.0.38). Between the governance row and the first word, a deck
reads as page furniture rather than as part of the document, and on a long
lesson it put fourteen slides in front of the paragraph that says what the
lesson is. The placement comes from the headings the author already wrote — no
marker, no frontmatter key._ The summary is a second reading of the document,
and the flashcards and quiz are what a reader does _after_ reading; a deck is
the SHAPE of the thing, and five minutes of slides gives the detail somewhere
to land. The predecessor puts its own near the top for the same reason, and
says so in its own reader's guide.

It carries a section heading in the record's established language — an accent
label, the deck's name in the display face, and the accent bar over a hairline
that every study-aid region uses. A quieter treatment was tried first and read
as loose text rather than as a section.

## 3 · What changed from the predecessor, and why

1. **Authoring.** `knowledge/` is CommonMark (critical rule 2), so a document
   cannot carry raw JSX and stay readable in a plain markdown viewer. The deck
   is an attachment.
2. **The frame is CLICK-TO-LOAD**, where the predecessor's is always-on. The
   browser suite asserts **zero external requests** on a built page, and an
   always-on frame breaks that on every page carrying a deck. The guarantee is
   worth more than the autoplay: it is what makes the site work offline and
   behind a firewall, and it means a reader who only wanted the policy never
   announces that to a slide host. `referrerPolicy="no-referrer"` for the same
   reason. An OWNED deck reaches nobody at all.
3. **The record can own the deck**, which the predecessor has no equivalent of.
   This is what makes the workflow complete: an agent writes the slides from
   the document with no browser and no human step
   (`.agents/skills/make-slides/`).

## 4 · The authored shape

```yaml
slides:
  title: Expense approvals
  description: The 15-minute version, for a room.
deck:
  - heading: When two copies disagree, one wins
    lead: One sentence, for a slide making a single point.
    bullets:
      - Two approvers above the threshold, always
      - The threshold is per invoice, including tax
    note: Spoken, never shown. Not a repeat of the slide.
```

- `heading` is required and should be a **claim**, not a label.
- `bullets` caps at **six**. A slide someone reads aloud is a slide nobody
  listens to, and a cap is the only thing that reliably stops a generator
  pasting a paragraph per slide.
- `note` is the presenter's, and renders **outside** the stage so it is not
  projected in fullscreen.
- Deliberately **no markdown or HTML in a slide**. What a slide says is
  knowledge; how it looks is the site's business, and admitting markup would
  put layout into the record — the embedding mistake, one level down.

## 5 · Rendering

Every slide is in the **server-rendered HTML**, hidden rather than absent, so a
crawler, a reader with JavaScript off and an agent parsing the page all get the
whole deck. Only navigation is client-side.

The stage is dark in both themes. A slide is a projection and the page around
it is a document; looking like the first thing while sitting inside the second
is most of what makes a deck legible at a glance. On a dark ground the stage
RISES rather than sinking — a darker stage measured L 4.4 against the page's
3.3 and lost its edges entirely.

## 6 · Acceptance

1. An owned deck renders after its document's introduction, immediately before
   the first `##` section, and nowhere else in the export; **every slide** is
   in the shipped HTML.
2. An owned deck ships **no `<iframe>`** and contacts nobody.
3. A linked deck ships no frame until a reader clicks; the link out is always
   present.
4. The parent's `/md/` twin, `llms.txt` and `llms-full.txt` are byte-identical
   with and without the deck.
5. `ksor ingest` creates no node; no `stable_id` resolves to one.
6. A restricted parent's deck appears in 0 files of a public build, against a
   positive control built for a viewer list that overlaps the parent's
   audience.
7. `ksor-slides-two-sources`, `ksor-slides-empty`, `ksor-slides-insecure` and
   `ksor-slides-no-embed` refuse in `pnpm build`. _Corrected 2026-08-25: was "in `pnpm check` and in
   `pnpm build`". The deck's shape is validated in `system/site/lib/slides.ts`
   at site-build time; none of the three slugs is in the record checker's set,
   so `pnpm check` accepts a deck declaring both sources._
8. Share urls become embed urls for the named providers; an unknown host
   with no explicit `embed:` is refused rather than framed empty
   (`ksor-slides-no-embed`), and with one it frames that url. _Corrected
   2026-09-02: this read "an unknown host renders as a link rather than an
   empty frame". The deriver returns null for one (`slides-embed.test.ts`,
   "an unknown host is not an error"), but the collection schema
   (`source.config.ts:130`) turns that null into a refusal, so a build never
   ships the link-only deck this clause described._

## 7 · Status against acceptance (2026-09-02)

Walked against the scaffold at this date: the four slugs are exactly the set
`system/site/lib/slides.ts` raises, and `slides-embed.test.ts` asserts the
provider derivations, https-only and the unknown-host null. 1–3 are asserted
on the built page by no suite this walk could find — the click-to-load frame
and "every slide in the shipped HTML" are browser behaviour — which keeps
this spec a draft; 4–6 follow from the attachment rule the study-attachments
spec holds.

## 8 · Out of scope

Generating slide IMAGES, exporting to PPTX or PDF, speaker timing, per-slide
transitions, and any deck spanning more than one document — a deck belongs to
one document the way a summary does, or it has nothing to be governed by.
