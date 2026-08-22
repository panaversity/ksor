---
format: 1
name: KSOR-STAMP-NAME
ksor:
  requires: ">=KSOR-STAMP-VERSION"
  scaffolded: "KSOR-STAMP-VERSION"
# The served MCP rung needs ONE required block: the NAME of the environment
# variable holding your Postgres DSN — never the DSN itself. Uncomment it, copy
# .env.example to .env, then: `pnpm provision` once (schema + grant), then
# `pnpm refresh` to PUBLISH the record, then `pnpm serve`. Serving does not
# publish — that is deliberate, and skipping refresh serves nothing.
# Nothing else here is required:
# `embedding:` already defaults to Gemini at 1536 dimensions, and leaving
# `retrieval:` out starts you with the abstention gate off and honest about it
# (turn it on afterwards with `ksor calibrate`, once the record is serving).
# database:
#   dsn_env: KSOR_DB_URL
# Where agents reach this record's MCP surface, and the semver it publishes as.
# Both go into /.well-known/mcp/server.json, the document an agent reads to
# DISCOVER this record instead of being told the URL. Leave mcp_url out until
# the server is actually published: an invented URL is worse than none.
# mcp_url: https://records.example.com/mcp
# version: 0.1.0
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

Until you do, this record describes KSoR rather than your organization — and
it describes it everywhere, not just on the page. The first paragraph above is
what `ksor serve` hands a connecting agent as its instructions, and what the
registry document publishes as this record's one-line description. That is the
cost of shipping a starter with something real in it instead of a placeholder:
a scaffold nobody has run the interview on will tell an agent, accurately, that
it is authoritative for what a Knowledge System of Record is. Replace it and
both surfaces follow, because both read this one paragraph.
