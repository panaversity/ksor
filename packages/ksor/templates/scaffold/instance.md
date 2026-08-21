---
format: 1
name: KSOR-STAMP-NAME
ksor:
  requires: ">=KSOR-STAMP-VERSION"
  scaffolded: "KSOR-STAMP-VERSION"
---

# Knowledge System of Record

This Knowledge System of Record is authoritative for — fill this in. It is the
single most important sentence in the project, it is the first thing the site
publishes, and it is what tells an agent where this record's authority ends.

The heading above is this record's **display title** — the human name every
page leads with. The intake interview replaces it with the real one
("Acme Operations Handbook"); the machine identity stays `KSOR-STAMP-NAME`
in the frontmatter, and that is what agents and citations use.

Everything below this frontmatter is the identity of this instance: what the
corpus covers, who it serves, and how strictly it should decline questions it
does not cover. This prose IS the agent surface's system prompt — `ksor serve`
wires it into the MCP server's instructions — so write it for a reader who must
act on it.

Ask your coding agent to run the **intake interview** (it knows how — see
`.agents/skills/intake-interview/`), answer its questions, and let it write
this document with you.
