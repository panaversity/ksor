---
"@panaversity/ksor": patch
---

Reading order is one rule again: the MCP door now reads `order:`

`order:` is the only ordering key a record may declare — it is in the governed
frontmatter set the format checker closes, and the checker's own remedy for a
stray `meta.json` says so. The MCP door never read it. The tree adapter was
converted from the predecessor, whose ordering keys were Docusaurus's
`position:` / `sidebar_position:`, neither of which a compliant record may
declare — so `outline` reported the record's structure in filename order and
called it the reading order, while the website honoured `order:`. On a
curriculum, where reading order IS the content, an agent asking "what do I read
first" got a different answer from the two surfaces.

Four smaller disagreements went with it, each now a row in a shared decision
table: unordered documents sorted at 10 000 rather than after everything;
fractional orders were truncated; ties compared `example.md` against
`example-two.md`, where `.` sorts after `-`, reversing ordinary pairs; and one
side folded case while the other did not.

The rule now lives in one file, copied into the scaffold and asserted
byte-identical, with `ORDER_CASES` run against BOTH surfaces — so a surface that
drifts fails on the row it broke.
