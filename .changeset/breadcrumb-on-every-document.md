---
"@panaversity/ksor": patch
---

The scaffolded site says where a document sits on **every** page, and the trail
names the document itself.

The shell's breadcrumb renders the folders above a page and nothing else, so it
appeared on `/docs/surfaces/for-agents` and was absent on `/docs/installing` —
the block above the title came and went as a reader moved through the record,
and it was missing on exactly the documents at the top of it. A page now reads
`⌂ › Surfaces › The agent surface`: a home link, the folders, and the document
itself.

The home link goes to the record's front door at `/`. The record's name became
the page tree's root, replacing fumadocs' "Docs" default, so a screen reader
hears it as the home link's label.
