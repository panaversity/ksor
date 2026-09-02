---
name: format-checker
description: The record's format rules as a runnable check — frontmatter, filenames, links, structure. Use before handing off any change to knowledge/, when a check fails and you need to fix it, or when unsure whether a document is well-formed. Run with `pnpm check` (or node .agents/skills/format-checker/check.mjs).
metadata:
  version: "3.0.0"
---

# Format checker

`pnpm check` runs `check.mjs`. The rules it holds the record to are the ones in
`AGENTS.md` → "Writing knowledge"; this file says only what that section does
not, which is how to relate to the program.

- **It is generated, and it is the same rule set** `ksor build` and
  `ksor ingest` run, so the three can never disagree about a well-formed
  record. Do not edit it: `ksor init` writes it and `ksor migrate` rewrites both
  copies when you upgrade, so an edit is overwritten rather than kept. It
  reports and never rewrites a file.
- **Obey the printed fix literally.** Every refusal prints where, the rule's
  slug (`problem: ksor-…`), why the rule exists, and the fix. If the fix does
  not resolve the problem, that is a bug worth reporting to ksor.
- **If its refusals contradict `AGENTS.md`, the checker is older than the
  record**: upgrade `@panaversity/ksor` and re-run `ksor migrate`. Never "fix"
  the record by undoing what a migration wrote.
- **When you edit any skill under `.agents/skills/`, re-copy it to
  `.claude/skills/`** — the checker holds the two trees byte-identical in both
  directions.
