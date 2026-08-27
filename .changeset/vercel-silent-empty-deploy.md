---
"@panaversity/ksor": patch
---

**A Vercel deployment that reports Ready and 404s everywhere now has a written
diagnosis, and the provenance hint stops blaming the reader.**

A deployment can report **Ready**, take the production alias, and serve
`404: NOT_FOUND` at every path, `llms.txt` included — after an install that ran,
a `ksor build` that ran, and every route prerendering. The only signal anywhere
is one build-log line, `WARNING! Build output contains no "functions" or
"static" directory`.

**The cause is not established, and the docs now say so rather than guessing.**
The Application Preset was the obvious suspect and is measured NOT to be it: two
live Git-linked projects, one preset `Services` and one preset `Other`, both
built the `services` block's `site` and `door` and both serve them (`/` 200,
`llms.txt` 200, `/mcp` 405 from the door). Naming a wrong cause in the deploy
guide would have sent every future reader to a field that is not the problem.

`deploying.md` and the scaffold README now name that failure, quote the warning
so it is searchable, and record two things verified live on a 205-document record
(issue #197): patching the project's own `outputDirectory` / `buildCommand` /
`installCommand` and taking a fresh Git-sourced deployment does **not** fix it —
`vercel.json` is what Vercel reads — and replacing the `services` block with the
classic top-level keys does. Two earlier sentences were corrected rather than
extended: the docs said a wrong preset meant "`/mcp` never exists", which asserted a
mechanism now measured false, and offered a site-only fallback as project
settings, which cannot override `vercel.json`.

**And `source: unspecified` now names both of its causes.** Only one is "you
never made a repository"; the other is a record that IS committed and pushed, on
a machine the `.git` directory never reached, because an upload-based deploy
excludes it — Vercel's CLI does. `git init` is still offered first, because it is
still right for the reader who has not made one; what is new is the second line,
for the reader who has, and who was previously being told to redo work they had
already done in the one message that governs provenance.

**A remedy also stops naming a flag the verb refuses.** `--source-commit` is an
`ingest` flag; `ksor build` rejects it as an unknown argument and exits 1. Two of
the five provenance notices offered it regardless of which verb was printing —
including the one this change is for, read by someone whose upload stripped
`.git` on the deploy path, for whom it would have turned a provenance warning
into a failed build. The flag is now offered only by the verb that accepts it,
and the same correction is applied to the `(dirty)` notice's `ksor build
--strict`, which had the defect latently. Both are asserted across every gap,
enumerated from the exported list rather than a copy of it.

The emitted `vercel.json` is unchanged.
