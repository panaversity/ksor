---
title: Deploying
status: draft
---

# Deploying a Knowledge System of Record

A KSoR publishes two surfaces from one record, and they deploy differently
because they are different things:

| surface      | what it is                                       | how it deploys                         |
| ------------ | ------------------------------------------------ | -------------------------------------- |
| **the site** | a fully static export — HTML, `llms.txt`, search | upload a folder to any static host     |
| **the door** | the MCP server, a live process reading Postgres  | run a container that listens on a port |

`ksor init` emits everything both need: `Dockerfile` and `.dockerignore` for the
door, and a `vercel.json` that puts the two behind one domain. This page is the
walkthrough, executed rather than described.

**Publishing is a third thing, and it is not on this page's critical path.**
Neither surface ingests. The door serves whatever generation is already active
in the database, and the site renders `knowledge/` from the repository. Getting
content INTO the database is [ingesting.md](./ingesting.md), and it is a deploy
step you run, never something a booting container does.

## The shape

```
                     ┌───────────────────────────────┐
   a reader  ────────▶  /            the site        │  static files
                     │  /docs/…                      │
                     ├───────────────────────────────┤
   an agent  ────────▶  /mcp         the door        │  container ──▶ Postgres
                     │  /health /ready               │
                     │  /.well-known/oauth-…         │
                     └───────────────────────────────┘
```

One domain, two services. An agent that finds `https://your-host/mcp` and a
person who opens `https://your-host/` are reading the same record.

## The container is the portable artifact

The emitted `Dockerfile` names no host. It installs the pinned
`@panaversity/ksor` from your `package.json`, honours `$PORT`, and runs
`ksor serve`:

```sh
docker build -t my-record .
docker run --rm -p 8080:80 --env-file .env my-record
```

That runs on Cloud Run, Fly, Render, ECS, Kubernetes, or a VPS with no changes.
`vercel.json` **points at this same file** rather than replacing it, which is
what keeps the host a choice — the artifact is yours, and moving it is a
redeploy, not a rewrite.

What the image deliberately does NOT contain (see `.dockerignore`):

- **`.env`** — configuration arrives from the environment at run time. A DSN
  baked into a layer is published to anyone who can pull the image.
- **`knowledge/`** — the door reads Postgres. Copying the corpus in would
  suggest the container reads it, and it never does.
- **`system/`** — that is the other surface, built and hosted separately.

## Deploying both surfaces to Vercel

The emitted `vercel.json` declares both services and routes between them:

```json
{
  "services": {
    "site": { "root": ".", "buildCommand": "pnpm build", "outputDirectory": "system/site/out" },
    "door": { "root": ".", "runtime": "container", "entrypoint": "Dockerfile" }
  },
  "rewrites": [
    { "source": "/mcp(.*)", "destination": { "service": "door" } },
    { "source": "/.well-known/oauth-protected-resource(.*)", "destination": { "service": "door" } },
    { "source": "/health", "destination": { "service": "door" } },
    { "source": "/ready", "destination": { "service": "door" } },
    { "source": "/(.*)", "destination": { "service": "site" } }
  ]
}
```

Deploy from the repository **root**, never from `system/site/`:

```sh
vercel deploy --prod
```

Two things about this file are worth knowing before you edit it.

**The catch-all must stay last.** Rewrites match in order, so a `/(.*)` rule
moved above the door's routes silently sends `POST /mcp` to the static site,
where it becomes a 404 and reads like the door is down.

**Do not add a project-level `trailingSlash`.** The site's own Next config
already sets it and exports `index.html` directories, so it buys nothing — and
at the project level it applies to the door too, where it redirects `POST /mcp`
to `/mcp/` with a 308. Found exactly that way: every door route 308ed until the
setting came out.

## Configuration

Three tiers, because listing them as one table reads as "set all of these or you
are doing it wrong" — and only the first tier is true.

### Required — the door will not boot without these

| variable                                  | why                                                  |
| ----------------------------------------- | ---------------------------------------------------- |
| `KSOR_DB_URL`                             | the record's Postgres store                          |
| `GEMINI_API_KEY`                          | embeds the incoming query, so retrieval works at all |
| `KSOR_AUTH`, **or** a configured SSO door | see below                                            |

`KSOR_AUTH` takes one of two values, and the value IS the decision:

```sh
KSOR_AUTH=disabled-local    # no auth, loopback only — a public bind REFUSES
KSOR_AUTH=disabled-public   # no auth, and served to anyone who can reach the port
```

**A container sets `$PORT`, so the door binds `0.0.0.0` — a public bind.**
`disabled-local` refuses there, deliberately: copying a dev `.env` into a hosting
dashboard must not quietly open your record to the internet. `disabled-public` is
correct for a genuinely public record or one behind your own gateway; it is not a
way to make a deploy go green.

The alternative is a real authorization server — `KSOR_SSO_URL`,
`KSOR_MCP_RESOURCE_URL`, `KSOR_JWT_ALLOWED_AUDIENCES`, with worked recipes for two
of them in [authorization.md](./authorization.md).

### Set this on any container host

| variable             | why                                      |
| -------------------- | ---------------------------------------- |
| `KSOR_SNAPSHOT_KEYS` | `kid=secret`, identical on every replica |

Unset mints an **ephemeral per-process key**. A `search` hands back a snapshot
token pinning the generation it answered from; `read` honours that pin so a
conversation stays on one version of the record. With a per-process key, a token
minted by one instance is unverifiable by the next — so `read` silently drops to
the ACTIVE generation and reports `refreshed (invalid)`.

It fails **soft**, so nothing errors and nothing logs. The only symptom is an
agent reading a generation it did not search, seen as roughly one read in three
coming back unpinned. Generate one with `openssl rand -hex 32`:

```sh
KSOR_SNAPSHOT_KEYS="k1=$(openssl rand -hex 32)"
```

`k1` is a label, not a secret — it appears in the token as `key_id` so you can
rotate later. The secret is used as literal text, never hex-decoded, and must be
byte-identical across every instance of one deployment. Set it once and leave it
alone: rotating invalidates every outstanding pin, and a compromised snapshot key
cannot read a withdrawn document, cross an audience boundary, or authenticate
anything.

The boot report now says so out loud when it matters:

```
snapshot EPHEMERAL key — generation pins will NOT survive a restart or a
         second instance; set KSOR_SNAPSHOT_KEYS to a value shared by every replica
```

### Set these once auth is ON

| variable               | why                                        |
| ---------------------- | ------------------------------------------ |
| `KSOR_ALLOWED_HOSTS`   | Host allow-list — DNS-rebind defence       |
| `KSOR_ALLOWED_ORIGINS` | browser Origin allow-list                  |
| `KSOR_SSO_ISSUER`      | one more check per token, for one variable |

Unset, Host validation is simply off on a public bind — permissive, not refusing,
so it is never the reason a deploy fails. It earns its place when auth is on:
rebinding is worth an attacker's effort only when it reaches something they could
not reach directly. With `KSOR_AUTH=disabled-public` the record is already served
to anyone who types the URL, so there is nothing for rebinding to steal.

### The site build needs the DSN too

Once `instance.md` declares a `database:` block, `pnpm build` runs
`pnpm export-denylist` first — it asks the database what has been withdrawn and
writes `.ksor-denylist.json`. Without `KSOR_DB_URL` the build **refuses**:

```
KSOR_DB_URL is unset, and instance.md declares a database
  why: a takedown lives in that database. Without it this build cannot tell
       'nothing is denied' from 'nobody asked'
```

That refusal is the design working. A takedown reaches the door instantly (it is
a row) and reaches the site at its next build (it reads a file), so a site built
without the DSN would keep publishing what the door already refuses. Set
`KSOR_DB_URL` on the site build as well as on the door.

## Authorization, or the deliberate absence of it

`ksor serve` **refuses to boot unauthenticated on a public bind.** There is no
auth-off default, and that refusal is the last real step of a deployment. Two
ways past it:

- **Configure the SSO door** — `KSOR_SSO_URL`, `KSOR_MCP_RESOURCE_URL`,
  `KSOR_JWT_ALLOWED_AUDIENCES`. Worked recipes for two different authorization
  servers: [authorization.md](./authorization.md).
- **Set `KSOR_AUTH=disabled-public`** — a deliberate decision that
  serves your whole record to anyone who can reach the port. Correct for a
  genuinely public record, or behind your own gateway. Never as a way to get a
  deploy green.

Check which one you got. `/health` says so plainly:

```json
{
  "corpus_id": "book",
  "abstain_gate": "OFF (no floor declared — will not refuse out-of-corpus questions)",
  "embedding_space": "gemini-embedding-001/d1536 ok",
  "auth": "disabled"
}
```

`"auth":"disabled"` on a public host means the second option is in effect.

## What a cold start costs

The door is built for a runtime that suspends it. It holds **no idle database
connections** — the pool minimum is 0 and an unused connection closes after 10s
— so a quiet instance keeps nothing open against a serverless Postgres, and the
first request after a suspend both wakes the database and retries the connect
rather than failing.

Measured against a live deployment on Vercel, Neon behind it, an 81-document
record of 6,963 chunks:

|                                        |           |
| -------------------------------------- | --------- |
| warm request                           | **~1.7s** |
| cold start (container + database wake) | **~9.1s** |

Most of the cold number is the two wakes, not ksor. If that matters for your
readers, the levers are your host's minimum instance count and your database's
suspend delay — both outside this tool.

`SIGTERM` drains and exits within 8s (`KSOR_DRAIN_TIMEOUT_MS`), inside the ~10s
a scale-to-zero runtime usually allows before `SIGKILL`.

## Verifying a deployment

In order, because each answers a different question:

```sh
B=https://your-host

curl -s $B/health          # the door booted, and on which posture
curl -s $B/ready           # the database answers
curl -s -o /dev/null -w '%{http_code}\n' $B/   # the site is served

curl -s -X POST $B/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
       "protocolVersion":"2025-11-25","capabilities":{},
       "clientInfo":{"name":"probe","version":"1"}}}'
```

If `/health` answers but a search returns nothing, the door is fine and the
**record was never published** — go to [ingesting.md](./ingesting.md). A first
deploy with no ingest serves an empty record, which is the single most common
"it deployed but does not work".

If `/mcp` returns HTML, the catch-all rewrite is matching before the door's
route.

## Deploying anywhere else

Nothing above is Vercel-specific except `vercel.json`. On any other host:

1. Build the site — `pnpm build` — and upload `system/site/out/` as static files.
2. Build and run the container, giving it the environment above.
3. Put the door at `/mcp` on the same domain, or a different one; if it is a
   different domain, set `KSOR_MCP_RESOURCE_URL` to the door's real URL, since
   that value is the record's identity in a token's audience, not a guess.
