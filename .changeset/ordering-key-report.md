---
"@panaversity/ksor": patch
---

Ingest says when a document's ordering key is one this record does not read

A record's reading order comes from the governed `order:` key alone. A corpus
arriving from Docusaurus, Hugo or Jekyll carries its own — `sidebar_position`,
`weight`, `nav_order` — and ksor ignored them in silence, falling back to file
name. That is a WRONG order, not a missing one, and it is the order served to
`llms.txt`, the rendered sidebar and the MCP `outline` alike.

Found on a real 81-document book where 73 files declared `sidebar_position`. Its
second chapter came out ninth; its preface came out eleventh. Nothing said why.

```
plain-tree: 73 document(s) declare `sidebar_position`, which this record does not
read — reading order fell back to file name (about.md, how-to-sell.md,
thesis.md, and 70 more). Rename it to `order:` to keep the intended sequence.
```

It reports on the same channel the adapter already uses for skipped files, where
the principle was already written down: a skip is reported, never silent. A
document that declares BOTH keys says nothing — `order:` wins, so nothing fell
back, and a warning there would only teach the reader to ignore the channel.
