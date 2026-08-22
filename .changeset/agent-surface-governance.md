---
"@panaversity/ksor": patch
---

The files AI agents read now carry the same governance the page shows.

A scaffolded site warned a reader that a policy had been replaced — an
unmissable notice above the title, naming its successor — and then handed an
agent the same policy as ordinary prose. In `llms.txt` a withdrawn document and
the one that replaced it were adjacent entries, told apart only by whatever a
human happened to type into a title; in `llms-full.txt` the withdrawn body
appeared with no status, no successor and no owner at all. An agent reading the
record answered from a policy nobody follows any more, and had nothing in the
bytes it was given to know that.

`llms.txt` now marks a document whose status is a caveat — `DRAFT`, `REVIEW`,
`SUPERSEDED` — and names the route that replaced a superseded one.
`llms-full.txt` puts the record's own keys back as frontmatter above each
document: status, owner, effective, the resolved successor, and every
provenance entry.

Two details are deliberate. A successor is named by the route a consumer can
fetch, never the `./successor.md` pointer it has no file tree to resolve. And
`site: governance: false` does not reach these files — that key decides what the
published pages show, while the record keeps every key for the agent surface and
the audit trail, so suppressing them here would recreate the defect on purpose.

Nothing else changes: no new dependency, no new frontmatter key, the same static
export. An approved document's index line stays clean, and a document that
declares no governance still emits none — a placeholder would read as governed.
