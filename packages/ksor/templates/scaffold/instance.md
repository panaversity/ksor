---
format: 1
name: KSOR-STAMP-NAME
ksor:
  requires: ">=KSOR-STAMP-VERSION"
  scaffolded: "KSOR-STAMP-VERSION"
---

# KSoR

This record is authoritative for what a Knowledge System of Record is, how a
project climbs the governance ladder, and which surfaces the same governed
knowledge is published through. It does not cover the CLI's release history or
the internals of the retrieval kernel.

Write and govern the knowledge once; every surface here derives from it. When a
slide deck, a wiki page or a model's memory disagrees with this record, this
record wins.

**Everything above is a starter record about KSoR itself, and it is yours to
replace.** It ships so that a fresh project has a real governed corpus to read
on the first `pnpm dev` — statuses, owners, provenance, a folder and a draft —
rather than an empty shelf. The documents live in `knowledge/`; delete them as
your own knowledge arrives.

The heading above is this record's **display title** — the human name every
page leads with. The intake interview replaces it with the real one
("Acme Operations Handbook"); the machine identity stays `KSOR-STAMP-NAME`
in the frontmatter, and that is what agents and citations use.

The first paragraph is the sentence that matters most: it is the first thing
the site publishes, and it is what tells an agent where this record's authority
ends. This prose IS the agent surface's system prompt — `ksor serve` wires it
into the MCP server's instructions — so write it for a reader who must act on
it.

Ask your coding agent to run the **intake interview** (it knows how — see
`.agents/skills/intake-interview/`), answer its questions, and let it write
this document with you.
