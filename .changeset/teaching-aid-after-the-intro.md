---
"@panaversity/ksor": patch
---

A document's teaching aid now renders **after its introduction**, not above it.

The deck used to sit between the governance row and the first word of prose,
which reads as a slot in the page's furniture rather than as part of the
document — and on a long lesson it put a fourteen-slide deck in front of the
paragraph that says what the lesson is.

The placement comes from the document's own shape: the introduction is
everything before the first `##` section, so the aid goes immediately before
that heading, and a document with no sections gets it after its prose. No
marker in the record and no frontmatter key — the headings the author already
wrote are the structure.

The recall aids (flashcards, quiz) are unchanged and stay at the end, because
those are used after reading.

The aid is placed in documents only — a `<doc>.summary.md` goes through the
same pipeline and is rendered without one.
