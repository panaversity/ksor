---
name: format-checker
description: The record's format rules as a runnable check — frontmatter, filenames, links, structure. Use before handing off any change to knowledge/, when a check fails and you need to fix it, or when unsure whether a document is well-formed. Run with `pnpm check` (or node .agents/skills/format-checker/check.mjs).
metadata:
  version: "1.1.0"
---

# Format checker

`pnpm check` runs `check.mjs` — dependency-free Node, owned by this repo. It
enforces what AGENTS.md states in prose:

- `knowledge/` holds CommonMark `.md` and images only — no `.mdx`, no
  `meta.json`, no other file types — and it is never empty; a record with no
  documents stands behind nothing.
- Every document carries `title` + `status` (level-0 requirement); the full
  allowed key set is closed; a `superseded` document names a `superseded_by`
  that resolves to a document that exists.
- Filenames are portable identities: lowercase, Windows-safe, no spaces, no
  case-collisions, no `foo.md` + `foo/index.md` pairs, no parentheses.
  (`.DS_Store` and friends are skipped, never reported.)
- Relative links resolve and never leave `knowledge/` — inline,
  `<angle-bracketed>`, and reference-style (`[text][label]` with its
  `[label]: target` definition) alike. Links inside code spans and fenced
  blocks are code, not links, and are ignored.
- `instance.md` exists, is `format: 1`, and carries only the keys the format
  defines — an unknown key is named, never ignored.
- `CLAUDE.md` stays a one-line pointer; `.agents/skills/` and
  `.claude/skills/` hold the same files byte for byte **in both directions**
  (a file only one tree carries is a rule nobody reviewed); the site contains
  no content files.

Every failure prints what is wrong, why the rule exists, and the fix — obey
the printed fix literally; if it doesn't resolve the problem, that is a bug
worth reporting to ksor.

When you edit any skill under `.agents/skills/`, re-copy it to
`.claude/skills/` — the checker holds the two trees identical, and it now
notices a file added on either side.
