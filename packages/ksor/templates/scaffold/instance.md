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

## This is a starter, and it is yours to replace

Everything above describes KSoR itself. It ships filled in so that a fresh
project has a real governed corpus on the first `pnpm dev` — statuses, owners,
provenance, a folder and a draft — instead of an empty shelf and a placeholder.
The documents live in `knowledge/`; delete them as your own knowledge arrives.

Be deliberate about replacing it, because a starter that describes the wrong
thing describes it _everywhere_. Two lines here are read by every surface:

- **The heading** is the display title — the human name every page leads with.
  The machine identity stays `KSOR-STAMP-NAME` in the frontmatter, and that is
  what citations and `llms.txt` use.
- **The first paragraph** is this record's scope. The site publishes it, and
  `ksor serve` hands it to a connecting agent as the MCP server's instructions.
  A record published with this paragraph unchanged will tell an agent — quite
  accurately, and quite uselessly for you — that it is authoritative for what a
  Knowledge System of Record is.

Ask your coding agent to run the **intake interview** (it knows how — see
`.agents/skills/intake-interview/`), answer its questions, and let it write
this document with you. Replace those two lines and every surface follows,
because every surface reads them from here.
