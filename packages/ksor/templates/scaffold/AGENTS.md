# AGENTS.md

The working contract for this Knowledge System of Record. CLAUDE.md points
here; every coding agent reads this file first.

## The two worlds

| Path          | What it is                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| `knowledge/`  | **the record** — governed markdown, the owner's world, the product                        |
| `system/`     | **the system** — all code that serves the record                                          |
| `instance.md` | what this SoR is authoritative for; its prose is the future agent surface's system prompt |

The record survives the system: `knowledge/` must stay readable and complete
even if `system/` is deleted. Dependency flows one way — the system reads the
record; the record never references the system.

`instance.md` carries a closed key set — `format`, `name`, `ksor`, `site` —
and everything that matters about it is the prose below that frontmatter;
`pnpm check` names any other key rather than ignoring it.

## Critical rules

1. **The site never contains authored content.** Knowledge goes in
   `knowledge/`, always. Never create markdown, MDX, or content pages inside
   `system/site` — the site _renders_ the record, it never _holds_ it.
2. **`knowledge/` is CommonMark `.md` only.** No `.mdx`, no `meta.json`, no
   framework files. A document must read cleanly in any markdown viewer.
3. **Never edit generated files** — `system/site/.source/`, `.next/`, `out/`,
   lockfiles by hand.

## Commands (run at the repo root)

```sh
pnpm install     # once, after cloning or scaffolding
pnpm dev         # the site, hot-reloading, at http://localhost:3000
pnpm build       # static site into system/site/out/
pnpm check       # the format checker — run before handing off any knowledge change
```

## Writing knowledge

- One document per file under `knowledge/`; the path is the document's
  identity and its URL — lowercase, hyphens, no spaces or special characters,
  no two files differing only in case, never both `foo.md` and `foo/index.md`.
- Frontmatter: `title` and `status` (`draft | review | approved | superseded`)
  are required. `owner` and `provenance` (a list naming real sources) are
  strongly encouraged — they become required as this project climbs the
  governance ladder. `description`, `order` (sidebar position), `effective`
  (the date the document takes effect) and `superseded` (a legacy marker —
  prefer `status`) are available. No other keys; never `id:` or `name:` — the
  path is the identity.
- A replaced document is marked `status: superseded` with `superseded_by:`
  pointing at its successor — superseded documents are never deleted.
- Images and assets live in `knowledge/` beside the document that uses them,
  referenced by relative links. A relative link must never leave `knowledge/`.
- Copy load-bearing values (numbers, thresholds, dates) exactly from their
  source, and name the source in `provenance`.

## Skills

- `.agents/skills/intake-interview/` — first run: interview the owner and
  write `instance.md` together.
- `.agents/skills/add-sources/` — turn source material (documents, pages,
  notes) into governed knowledge.
- `.agents/skills/format-checker/` — the rules above, as a program;
  `pnpm check` runs it and its errors explain how to fix themselves.

## What this project owns

Everything. The scaffold was emitted by `ksor init` (version recorded in
`instance.md`) and belongs to this repository outright — change anything in
`system/` deliberately; the knowledge in `knowledge/` was always yours.
