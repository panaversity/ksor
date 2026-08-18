---
title: Your first governed document
status: draft
---

# Your first governed document

This file exists so the record is never empty: browse it with `pnpm dev`,
then replace it with real knowledge.

A governed document is plain markdown with a small frontmatter header. This
one carries the two required keys — `title` and `status: draft`. As the
knowledge matures, documents gain `owner` and `provenance` (who stands behind
this, and which sources it came from), move to `status: approved`, and — when
replaced — are marked `superseded`, never deleted.

Ask your coding agent to run the **intake interview** to define what this
Knowledge System of Record is authoritative for, then start adding documents
with the **add-sources** skill. `pnpm check` keeps every document honest.
