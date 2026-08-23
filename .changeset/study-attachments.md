---
"@panaversity/ksor": patch
---

Summaries and flashcard decks, as governed attachments of a document.

A document in `knowledge/` may now carry two companions named after it —
`<doc>.summary.md` and `<doc>.flashcards.yaml`. The summary joins the record's
own words as a second tab; the deck renders at the end of the page, with spaced
review kept in the reader's browser and Shuffle / Guide / Download beneath it.
`ksor init` ships one of each so a fresh project shows the shape rather than
describing it.

An attachment is **part of its document, not a document**. It gets no URL, no
sidebar row, no `llms.txt` line, no markdown twin, no search entry — and no
stable id, so an agent can never cite it as a source in its own right. It takes
its `visibility:` and its takedown from its parent: restrict or withdraw the
document and its summary and deck go with it. An attachment declaring
frontmatter, or one whose document is missing, is refused by `pnpm check` and by
`pnpm build`.

**If your record already has `.summary.md` files and you serve over MCP, read
this.** They were previously ingested as ordinary documents, each with its own
id and its own governance defaults. They no longer are. After upgrading, run
`pnpm refresh`; if a takedown names one of those ids, `ksor serve` will refuse
to boot until the denial is pointed at the parent document or retired
deliberately. That refusal is the fix working — those rows governed a node that
should never have existed.

Review scheduling is a two-grade SM-2 variant (`ksor-sm2-v1`). It is not FSRS
and claims no retention target.
