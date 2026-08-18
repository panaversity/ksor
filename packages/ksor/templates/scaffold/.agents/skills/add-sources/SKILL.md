---
name: add-sources
description: Turn source material — documents, pages, pasted text, notes — into governed knowledge in knowledge/. Use when the owner shares material to add, says "add this to the knowledge base", or asks how to get existing content in. Not for editing the site.
metadata:
  version: "1.2.0"
---

# Add sources

Converting material into the record is the everyday work of this project.
The rules that make it _governed_ rather than merely stored:

## Placement and shape

- One document per topic, under `knowledge/`, path = identity: lowercase,
  hyphens, a folder per natural grouping. Plain CommonMark `.md` — if the
  source is rich (tables, images), tables become markdown tables and images
  land _beside the document_ with relative links.
- A folder's front page is `<folder>/index.md`; reading order is the
  `order:` frontmatter key (ordered documents first, ascending; the rest
  follow alphabetically) — never `meta.json` or `sidebar_position`.
- Frontmatter: `title` and `status: draft` always; add `owner` (who stands
  behind this content) and `provenance` (a list naming the actual sources —
  file names, systems, people, dates) whenever the owner can tell you.
  Precision matters: "Finance policy manual §4.2, 2025 edition" governs;
  "internal docs" does not.
- When `instance.md` declares `audiences:`, ask the owner which audience the
  new material belongs to and write it as `visibility:` — never guess that
  restricted material is public.

## Fidelity rules

- **Copy load-bearing values exactly** — numbers, thresholds, dates, names.
  Never round, never paraphrase a figure.
- **Two disagreeing sources stay two statements**, each with its provenance
  — never smooth a conflict into one invented truth; flag it to the owner.
- **Do not fill gaps from general knowledge.** If the source doesn't cover
  something, the record doesn't either — that boundary is the product.
- A document replacing an older one: mark the old one `status: superseded`
  with `superseded_by:` pointing at the new — never delete it.

## Finish every batch

Run `pnpm check` and fix what it reports (its errors explain themselves),
then show the owner the rendered result (`pnpm dev`) — the site is the
review surface: you write, they check.
