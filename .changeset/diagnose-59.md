---
"@panaversity/ksor": patch
---

Record why the vector index is unused, and what fixing it would cost

Diagnosis only — no serving behaviour changes. Answers are unaffected, and were
already correct: the query plans a sequential scan, and a sequential scan is
EXACT. What grows with the corpus is the work, not the error.

The cause recorded until now — a window function, then joins and predicates
Postgres cannot estimate — was incomplete. Testing each clause on its own shows
a cost mispricing underneath: a full sequential pass over 20,000 chunks,
including 20,000 1536-dimension distance computations, is priced at 1904 for
work that takes ~130 ms, while the HNSW scan's startup cost alone is 2137.

A restructured arm reaches 36 ms against 648 ms — but only with `ef_search` at
pgvector's default, which is the setting where the index missed the true nearest
neighbour for 1 query in 100 on a bed with real cluster structure, dropping the
top-1 similarity by 0.99. Against this record's ~0.01 abstention separation,
that flips an abstention: the corpus holds the answer and the door says it does
not. The speed and the approximation cannot be separated, so taking them is an
owner decision rather than a tuning change.

Both the current plan and the fix path are now pinned by tests, so neither can
drift unnoticed.
