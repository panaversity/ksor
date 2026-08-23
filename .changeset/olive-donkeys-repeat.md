---
"@panaversity/ksor": patch
---

Stage the record under a lock, so a build that evaluates its config more than
once cannot publish a short site.

A site build evaluates `source.config.ts` in more than one process — seven of
them staged the record in one measured build — and staging was destructive on
every evaluation: delete the whole per-audience stage, refill it. Two of those
overlapping deleted a tree the other was copying into. Six
concurrent evaluations of a 150-document record failed 42 of 48 runs — `ENOENT`
and `EINVAL` out of `copyFileSync`, `ENOTEMPTY` out of `rmSync` despite its
retries, and, in 27 of the 48, no error at all: staging returned success and
handed the build a stage a third of the record short. That last shape is the one
that matters — a crash fails a build, a short stage publishes one, with
documents missing from `/docs`, `llms.txt` and the search index and nothing
saying so.

Staging now takes a lock file (`system/site/.staged-knowledge.lock`, gitignored,
stamped with the holder's pid so a killed build's lock is broken rather than
waited on), and an evaluation that finds the stage already holding exactly its
plan — byte for byte — leaves it alone instead of rebuilding it. Together those
mean the destructive path runs once per build, alone. No behaviour changes for a
build that was already succeeding.
