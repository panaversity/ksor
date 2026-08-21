---
"@panaversity/ksor": patch
---

The dimension ceiling says which shape it applies to, instead of blaming pgvector

`ksor schema` refuses an embedding dimension above 2000 with
"(pgvector vector + HNSW ceiling)". The refusal is right and the reason was
wrong: pgvector indexes a `vector` to 2000, but a **`halfvec` to 4000**, via an
expression index on the cast — verified live against a real database, where
`hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)` plans an Index Scan.

The old wording read as pgvector's own limit, so an adopter whose model emits
more than 2000 dimensions could conclude it was unusable here, over a wall that
is not one. The message now names the shape the ceiling belongs to — this schema
declares `VECTOR(dim)` columns and indexes one directly — and the constant
carries why raising it is a decision rather than an edit: every query site would
have to use the same cast as the index or fall silently back to a sequential
scan, and the halfvec arm's float16 rounding lands on the score the abstention
gate reads.

The same claim is corrected in the scaffold's `AGENTS.md`, which gains the reason
`dim: 1536` is the shipped default: `gemini-embedding-001` emits 3072 and ksor
asks it for 1536, which per Google's published MTEB table costs nothing
measurable — 1536 scores 68.17 against 2048's 68.16.

The 2000 refusal is unchanged. Issue #49 records the decision it now points at.
