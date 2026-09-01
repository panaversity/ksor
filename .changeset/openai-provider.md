---
"@panaversity/ksor": patch
---

OpenAI joins Gemini behind the embedding seam, and the wiring stops naming one
vendor (issue #25).

The seam was already vendor-neutral in shape — `EmbeddingProvider`, the
framework's normalization and degeneracy checks, and an embedding space
identified by `modelId` + column width and never by the vendor. What was
Gemini-bound was the WIRING: `GEMINI_API_KEY` was spelled into three composition
roots, so a second provider could not obtain a key even though the registry
would happily build it. Each registry row now names its own key variable, and
the roots ask, exactly as `instance.md` names the DSN variable rather than
hardcoding it.

`provider: openai` with `model: text-embedding-3-small` and `dim: 1536` reads
`OPENAI_API_KEY`. Over `fetch`, no SDK — the same call decision 12's 2026-08-22
revision made for Gemini, and for the same reason.

Two things a live call surfaced that a stub would not. Response items carry
their own `index` and the vendor does not promise array order, so they are
sorted before the framework pairs them positionally — a shuffled response is the
same count, the same width and all finite, so every downstream check passes
while every passage carries another's vector. And an exhausted balance arrives
as **429**, the same status as a rate limit: it is now read from the vendor's
`error.type` and never retried, because five exponential backoffs do not add
credit.

Switching provider is a re-embed of the whole corpus and a re-measured
`vector_floor`. A different provider is a different embedding space, and the
invariant against copying a calibrated constant applies across vendors with more
force, not less.

Verified live against the real API on a funded key: 1536-dimension vectors, a
paraphrase at cosine 0.812 against an unrelated sentence at 0.058, and the two
intents agreeing to 0.9997 — which is the symmetry that makes the empty task
labels correct. Then through the whole plane: a real record ingested to Postgres
under `embedding_model = text-embedding-3-small`, 23 chunks, 0 failed, stored at
the declared width of 1536 and L2-normalized as the framework promises.

One more defect the live call found: `buildShippedProvider` handed EVERY
provider Gemini's task labels from global config, so an OpenAI run logged its
space as `text-embedding-3-small/d1536/RETRIEVAL_DOCUMENT` — a label that vendor
has no concept of and never received. The labels moved onto the registry row,
where a vendor's shape belongs.
