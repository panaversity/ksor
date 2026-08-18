---
name: format-checker
description: The record's format rules as a runnable check — frontmatter, filenames, links, structure. Use before handing off any change to knowledge/, when a check fails and you need to fix it, or when unsure whether a document is well-formed. Run with `pnpm check` (or node .agents/skills/format-checker/check.mjs).
metadata:
  version: "1.0.0"
---

# Format checker

`pnpm check` runs `check.mjs` — dependency-free Node, owned by this repo. It
enforces what AGENTS.md states in prose:

- `knowledge/` holds CommonMark `.md` and images only — no `.mdx`, no
  `meta.json`, no other file types.
- Every document carries `title` + `status` (level-0 requirement); the full
  allowed key set is closed; `superseded` documents name a `superseded_by`.
- Filenames are portable identities: lowercase, Windows-safe, no
  case-collisions, no `foo.md` + `foo/index.md` pairs, no parentheses.
- Relative links resolve, and never escape `knowledge/`.
- `CLAUDE.md` stays a one-line pointer; `.claude/skills/` copies stay
  byte-identical to `.agents/skills/`; the site contains no content files.

Every failure prints what is wrong, why the rule exists, and the fix — obey
the printed fix literally; if it doesn't resolve the problem, that is a bug
worth reporting to ksor.

When you edit any skill under `.agents/skills/`, re-copy it to
`.claude/skills/` — the checker holds the two trees identical.
