---
"@panaversity/ksor": patch
---

**A Vercel deployment that reports Ready and 404s everywhere now has a written
diagnosis, and the provenance hint stops blaming the reader.**

A project imported from Git comes back with Framework Preset `Other` and
`outputDirectory` / `buildCommand` / `installCommand` all `null`, which ignores
the `services` block in `vercel.json`. The install runs, `ksor build` runs, every
route prerenders — and Vercel then collects nothing: the deployment reports
**Ready**, takes the production alias, and serves `404: NOT_FOUND` at every path,
`llms.txt` included. The only signal anywhere is one build-log line,
`WARNING! Build output contains no "functions" or "static" directory`.

`deploying.md` and the scaffold README now name that failure, quote the warning
so it is searchable, and record two things verified live on a 205-document record
(issue #197): patching the project's own `outputDirectory` / `buildCommand` /
`installCommand` and taking a fresh Git-sourced deployment does **not** fix it —
`vercel.json` is what Vercel reads — and replacing the `services` block with the
classic top-level keys does. Two earlier sentences were corrected rather than
extended: the docs said a wrong preset meant "`/mcp` never exists" (it means the
whole site is empty), and offered a site-only fallback as project settings (which
cannot override `vercel.json`).

**And `source: unspecified` now names both of its causes.** Only one is "you
never made a repository"; the other is a record that IS committed and pushed, on
a machine the `.git` directory never reached, because an upload-based deploy
excludes it — Vercel's CLI does. `git init` is still offered first, because it is
still right for the reader who has not made one; what is new is the second line,
for the reader who has, and who was previously being told to redo work they had
already done in the one message that governs provenance.

**A remedy also stops naming a flag the verb refuses.** `--source-commit` is an
`ingest` flag; `ksor build` rejects it as an unknown argument and exits 1. Every
notice printed by `build` therefore offered an escape hatch that would have
turned a provenance warning into a failed build for whoever followed it —
including the reader this change is for, whose upload stripped `.git` on the
deploy path. The flag is now offered only by the verb that accepts it, and a test
asserts that across every gap rather than only the one that had the bug.

The emitted `vercel.json` is unchanged.
