---
---

Dev-only: a second gold set and the harness that measures it. Nothing ships, so
no version bump.

`packages/content/src/evals/` gains a handbook-shaped corpus fixture, an authored
gold set, and a relevance harness reporting success@k over distinct nodes.
Reported, never gating, per the testing contract — with two characterization
assertions that pin what today's classifier can and cannot reach, so a change to
`NAV_MAX_CHARS` or `classify()` arrives as a reviewed diff with numbers rather
than a silent shift in what the record can answer (issue #55).
