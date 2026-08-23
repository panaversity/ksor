---
"@panaversity/ksor": patch
---

Each document page now says how long it takes to read.

The figure is counted when the site is built, from the document's own markdown,
so it is in the shipped HTML — a reader whose bundle failed, a crawler and an
agent parsing the page all get it. Fenced code and frontmatter are left out of
the count, so a short page carrying a long example is not reported as a
twenty-minute read.

Nothing to author: it is derived from the words already there. Where a document
has a summary, both tabs carry their own figure, so a reader can see what the
summary saves them before opening it.
