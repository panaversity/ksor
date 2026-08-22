---
"@panaversity/ksor": patch
---

An interrupted ingest no longer throws away the embeddings it already paid for

A killed `ksor ingest` leaves its generation in state `building`. Carry-forward
accepted only `ready`, `active` and `retired` sources, so the rerun found nothing
to copy and embedded the entire corpus again — paying twice for work that was
sitting in the database, correct and complete.

Found while ingesting an 81-document book into a managed Postgres. The run was
killed at 4,736 of 6,963 chunks; the rerun reported `carried 0, pending 6963`.

```
before   structure: 82 nodes, 81 sources, 6963 chunks; carried 0,    pending 6963
after    structure: 82 nodes, 81 sources, 6963 chunks; carried 4736, pending 2227
```

The asymmetry is what made it expensive. Interrupt a RE-ingest and a complete
generation still exists, so the rerun carries from it and costs almost nothing.
Interrupt the FIRST ingest and there is no complete generation at all — and the
first ingest of a large corpus is the longest, the least familiar, and the one an
operator is most likely to interrupt.

Nothing about an abandoned run makes its vectors wrong. An embedding is a pure
function of its input and model, the match key already establishes identity, and
carry only ever fills chunks still marked pending. So a run's state now decides
the ORDER sources are tried in, not whether they may be used at all: the active
generation first, so vetted vectors always win, then complete generations newest
first, then abandoned ones.
