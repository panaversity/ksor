---
"@panaversity/ksor": patch
---

A YAML list in frontmatter no longer costs the document its title

The frontmatter reader emptied a document's ENTIRE metadata whenever a top-level
value opened with `[ { | > & * !`. One `authors: ["…"]` line beside the title,
and the title went with it — along with `order:` and `sor_id:`.

Found on a real 81-document book, where four chapters were served under names
derived from their filenames:

| served as                    | declared                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| `Preface Agent Native`       | `Preface: The Right Side of the Line`                           |
| `System Of Context`          | `The System of Context: Connecting the Records to Real Work`    |
| `Designing The Vertical Sor` | `Designing the Vertical System of Record from First Principles` |

Titles reach the site, `llms.txt` and the MCP `outline`, so this was wrong on
every surface at once, and silently.

The reader is documented as PyYAML-compatible and empties the map only where
PyYAML raises. PyYAML does not raise on a flow sequence — it parses it. Two
different things were being conflated:

- **invalid** — an unquoted `a: b: c`, a trailing `:`. PyYAML raises; the map is
  still emptied, unchanged.
- **valid but not modelled here** — a flow sequence or mapping, a block scalar,
  an anchor. PyYAML parses these. Only the KEY is beyond the reader now; the
  document survives.

**One identity change to know about.** A document that declares `sor_id:`
_alongside_ such a value previously had that override silently dropped, so its
stable_id fell back to the path. The override now stands, on both surfaces
together — so re-ingesting changes the stable_id of exactly those documents, and
any takedown row keyed on the old path-derived id must be re-pointed. The site
and the kernel change in step, which is the property `stable-id-conformance`
exists to hold.

One governance guard gets quieter and no weaker: ingest used to REFUSE a
document declaring `visibility:` beside a flow list, because the map was emptied
and the tier silently defaulted. The cause is gone, so it ingests with the right
visibility; the refusal still stands for frontmatter PyYAML genuinely rejects.
