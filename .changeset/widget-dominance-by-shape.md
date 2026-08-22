---
"@panaversity/ksor": patch
---

A quiz no longer swallows the explanation that precedes it

The previous release moved navigation from a length test to a shape test, so a
short fact stopped being mistaken for a link list. The rule that decides whether
a whole section is *a widget* — a quiz, a slide embed — was left on the old
threshold: under 250 characters of teaching before the widget, and the entire
section was labelled `assessment` or `embed`, neither of which any search
returns.

So a section carrying a complete 180-character explanation followed by a
knowledge check lost the explanation too. Same defect as the last one, one path
over.

Both paths now ask the same question: is what comes BEFORE the widget actually
navigation-shaped? A heading with only a quiz under it is still a quiz. A link
list before a quiz is still a quiz. An explanation before a quiz is an
explanation, and stays searchable.

Found by ingesting a real 81-document curriculum corpus, where 610 chunks landed
as `assessment` and 186 as `embed` — together 79% of everything unsearchable in
that record.

`CHUNK_POLICY` moves to v7 (persisted provenance; the labels it names changed),
and `NAV_MAX_CHARS` is deleted — nothing reads it now. **Re-run `ksor ingest` to
pick this up**; unchanged content is not re-embedded.
