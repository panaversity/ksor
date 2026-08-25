---
format: 2
name: KSOR-STAMP-NAME
title: KSoR
description: What a Knowledge System of Record is, how a project climbs the governance ladder, and which surfaces publish the same governed knowledge.
toolchain:
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

This record is authoritative for what a Knowledge System of Record is, how a
project climbs the governance ladder, and which surfaces the same governed
knowledge is published through. It does not cover the CLI's release history or
the internals of the retrieval kernel.

Write and govern the knowledge once; every surface here derives from it. When a
slide deck, a wiki page or a model's memory disagrees with this record, this
record wins.

## This is a starter, and it is yours to replace

Everything above describes KSoR itself. It ships filled in so that a fresh
project has a real governed corpus on the first `pnpm dev` — five approved
documents, three of them inside a folder, and one carrying all four study
attachments (a summary, slides, flashcards and a quiz) — instead of an empty
shelf and a placeholder.
The documents live in `knowledge/`; delete them as your own knowledge arrives.

Be deliberate about replacing it, because a starter that describes the wrong
thing describes it _everywhere_. Three things here are read by every surface:

- **`title:`** is the display title — the human name every page leads with and
  the heading of the record's root index. The machine identity stays
  `KSOR-STAMP-NAME` in `name:`, and that is what citations and `llms.txt` use.
- **`description:`** is one sentence that seeds `llms.txt` and the MCP
  discovery document.
- **This body** is the MCP server's instructions, handed in full to every
  connecting agent; its first paragraph is this record's scope, which the site
  publishes. A record published with it unchanged will tell an agent — quite
  accurately, and quite uselessly for you — that it is authoritative for what
  a Knowledge System of Record is.

Ask your coding agent to run the **intake interview** (it knows how — see
`.agents/skills/intake-interview/`), answer its questions, and let it write
this document with you. Replace those three and every surface follows,
because every surface reads them from here.
