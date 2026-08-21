---
---

Dev-only: no shipped behaviour changes, so this deliberately carries no version
bump.

A characterization test pins the vector arm's query PLAN, which is currently
wrong — `idx_chunks_hnsw` is built, maintained and never opened (issue #59). It
asserts the defect so a fix, or a further regression, arrives as a red test with
the plan printed. The same defect was announced as fixed once before and
returned through a different clause because nothing asserted the outcome.

Also removes a latent hazard found while investigating it: the standalone search
arms derived their WHERE clause with `ARM_WHERE.replaceAll("$5", "$4")`, which
works only while the predicate contains exactly one placeholder. Adding a second
one breaks every derived query silently, and the failure surfaces as "content
store temporarily unavailable" — a message that says nothing about the cause.
The parameter number is now an argument.
