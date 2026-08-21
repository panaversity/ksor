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

# Knowledge System of Record

The heading above is this record's **display title** — the human name every
page leads with. The intake interview replaces it with the real one
("Acme Operations Handbook"); the machine identity stays `KSOR-STAMP-NAME`
in the frontmatter, and that is what agents and citations use.

This Knowledge System of Record is authoritative for — _fill this in; it is
the single most important sentence in the project._

Everything below this frontmatter is the identity of this instance: what the
corpus covers, who it serves, and how strictly it should decline questions it
does not cover. This prose IS the agent surface's system prompt — `ksor serve`
wires it into the MCP server's instructions — so write it for a reader who must
act on it.

Ask your coding agent to run the **intake interview** (it knows how — see
`.agents/skills/intake-interview/`), answer its questions, and let it write
this document with you.

Until you do, `ksor serve` says so — at boot, and to every agent that connects:
the MCP surface replaces this template with a plain statement that the record's
scope is unstated, rather than passing authoring guidance to a runtime agent as
if it were instructions. Nothing breaks, and the record still answers with
citations; it just cannot tell an agent what it is authoritative FOR, which is
the one thing that makes an answer worth trusting.
