---
"@panaversity/ksor": patch
---

feat: restarting an unedited record is free. `ksor serve` runs ingest on every
start, and ingest now compares the corpus it just read against the generation
already serving — identical content at the same source commit consumes no
generation, writes no rows, and embeds nothing ("unchanged — generation N
already serves this corpus"). Editing a document still builds a generation and
re-embeds only what changed, and a new source commit over identical bytes still
records one, because that is a build fact provenance must keep.
