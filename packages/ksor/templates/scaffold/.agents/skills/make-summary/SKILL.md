---
name: make-summary
description: Write the summary of a document and attach it, so it renders as a second tab on that document's page. Use when the owner says "summarise X", "make a summary for this", "add summaries to the record", "give me the short version", or asks for a TL;DR, an abstract or a précis of a governed document.
metadata:
  version: "1.1.0"
---

# Writing the summary of a document

You write the summary. Not an outline for somebody else to finish — the actual
file, `<doc>.summary.md`, which the site renders as a **Summary** tab beside
the document's own words.

Run it end to end: read the document, write the summary, check every line back
against the document, verify it builds. **The check is not optional** — it is
what keeps a summary from becoming a second, unreviewed copy of the record.

## The one rule everything else serves

**A summary may only say what the document says.**

It is a compression of the record, never a second source. A summary asserting a
threshold the document does not contain is a claim nothing governs — and
because the summary is an attachment, the record now stands behind it. Every
number, date, name and rule is copied exactly, units included.

If the document does not say something the summary seems to need, there are two
honest options: leave it out, or tell the owner the document is missing it.
Never a third.

## The second rule: cover every section

**Every `##` section of the document is represented in the summary.**

A summary that covers the opening and trails off is worse than none: a reader
who used it believes they have the whole document. Walk the headings in order
and check each one has landed somewhere in the summary before you call it done.

A `###` subsection does not need its own line — fold it into its parent's,
unless it carries a rule or a number of its own, in which case it does.

## 1 · Read the document whole, first

Read `<doc>.md` completely before writing anything. Note as you go:

- **the decision it settles** — the reason it exists, usually one sentence
- **the rule, in its own words**
- **the numbers** — thresholds, deadlines, limits, and their units
- **each `##` section** — and the one thing it is there to say
- **the boundary** — what the document explicitly does NOT cover
- **its governance** — `status`, `ksor.owner` and `ksor.effective_from` from
  the frontmatter

If the document already carries `<doc>.slides.yaml`, read it: it is a reviewed
compression of the same thing, and the two must not disagree.

## 2 · Write the summary

Write `<doc>.summary.md` beside the document. Its frontmatter is exactly one
key and the checker refuses any other — a summary inherits its parent's
audience, status and takedown, and a second key there would claim governance a
non-document cannot carry:

```markdown
---
type: Summary
---

The lead: what this document settles, in one or two sentences, in the
document's own words. **Bold the thing a reader must not misremember.**

- One line per `##` section, in the document's order.
- Numbers exactly as the document states them, units included.
- What the document explicitly does **not** cover.
```

**Shape:**

| Part      | Use                                                      |
| --------- | -------------------------------------------------------- |
| lead      | one or two sentences — the decision the document settles |
| bullets   | one per `##` section, in the document's own order        |
| last line | the boundary: what this document does not settle         |

**Length:** aim for a fifth of the document, and never more than a quarter. If
the summary approaches the document's length, it has stopped being a summary
— cut the elaboration, keep the rules.

**Habits that decide whether it is any good:**

- **Lead with the decision, not the definition.** A reader opening the Summary
  tab wants what this settles, not what the topic is.
- **Keep the document's own words for anything load-bearing.** Paraphrase the
  explanation; copy the rule.
- **A bullet is one thought.** If it needs a comma splice, it is two bullets.
- **Say what is excluded.** The boundary is the half a compression loses first
  and the half a reader is most likely to get wrong.
- **Do not add.** No context, no advice, no "note that" — the document is one
  click away.

## 3 · Check every line against the document

Go back through the summary with the document open. For each line:

- Is the claim in the document? Name where.
- Is every number identical, same units, same rounding?
- Does any line imply a rule the document does not state?
- Walk the `##` headings in order: is each one represented?
- Would a reader who read ONLY this be wrong about anything?

That last question is the one that matters. A summary is used instead of the
document, not before it.

## 4 · Verify it

```sh
pnpm check     # refuses an orphan, or frontmatter that is not exactly `type: Summary`
pnpm dev       # open the page — a Summary tab appears beside Document
```

The build refuses:

- `ksor-attachment-orphan` — no `<doc>.md` beside it
- `ksor-attachment-frontmatter` — anything but exactly `type: Summary`

If no Summary tab appears, the file name is wrong: it must be exactly
`<doc>.summary.md`, matching the document's own name.

## 5 · Tell the owner what you did

Which document, how long the summary is against the document, and **anything
you left out because the document did not support it**. That last part is the
useful half: it is how an owner finds out their document has a gap.

Summarising several documents at once? Report them as a list with the same
three facts each, and name any document you did NOT summarise and why — a
document too short to compress does not need one, and saying so is the answer.

## What NOT to do

- **Do not summarise a document you have not read whole.** A summary written
  from the first screen is confidently wrong about the rest.
- **Do not write a line the document cannot support**, even a true one. If it
  is not in the record, the record cannot stand behind it.
- **Do not give a short document a summary.** Under roughly two screens there
  is nothing to compress, and a Summary tab that restates the page teaches a
  reader that the tab is not worth opening.
- **Do not make one summary for several documents.** A summary belongs to one
  document. One spanning five policies has no document to be governed by and
  nothing to be withdrawn with.
- **Do not patch a stale summary.** When the document changes materially,
  rewrite from it. Patching is how a summary and its document drift, and a
  reader on the Summary tab has no way to see that it happened.
