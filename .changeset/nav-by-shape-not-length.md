---
"@panaversity/ksor": patch
---

Short documents reach search again — navigation is a shape, not a length

A record could be fully ingested, report "embedded 16, failed 0", and still be
unable to answer questions it plainly contained. Sections were classified as
navigation by LENGTH — anything under 250 characters — and navigation is
excluded from every retrieval arm. On a handbook that inverts the intent,
because a handbook's most valuable statements are its shortest.

Walked on 0.0.14 with three ordinary policy statements — a refund window, an
escalation path, a badge rule, 200-300 characters each. Three of four chunks
were unsearchable, and:

> **Q.** "how long does a buyer have to send something back"
> **A.** the scaffold's placeholder page — against a record stating *thirty days*

The answer was in the corpus, correctly ingested, readable by slug, and
unreachable by search.

Navigation is now decided by shape: a section is navigation when link lines are
most of it, or when what remains after them is too short to answer anything —
the same floor the serving predicate already applies. Length is no longer
consulted, so a 180-character link list is navigation and a 51-character fact is
not, which is the ordering length had backwards.

Measured on an authored handbook gold set with real embeddings, paired: short
substantive facts went **0/9 to 9/9 at rank 1**, the long-prose control held at
**4/4**, and the link-list page was returned **0** times. That last number is the
one that matters — admitting everything would have improved the first two and
made the product worse.

**To pick this up, re-run `ksor ingest`.** Chunks are re-classified on every
build and unchanged content is not re-embedded, so the upgrade costs a build,
not an embedding bill. `CHUNK_POLICY` moves to v6 because it is persisted
provenance and the behaviour it labels has changed.
