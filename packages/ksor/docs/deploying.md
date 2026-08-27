---
title: Deploying
status: draft
---

# Deploying a Knowledge System of Record

## Before you start

Commands on this page use the pnpm spelling (`pnpm build`, `pnpm serve`).
Since 0.0.36, `ksor init` emits the scaffold for the manager that ran it —
npm and bun included — and your scaffold's own README speaks that manager;
translate accordingly (`npm run build`, `bun run build`).

Four things must exist, and the order matters. Nothing below works without them,
and three of the four are outside this page.

|     | what                                                 | where                                                                                    |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **A Postgres with pgvector** — a managed one is fine | your provider; `CREATE EXTENSION vector;`                                                |
| 2   | **A provider key** for embeddings — `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) — free tier is enough to start |
| 3   | **The schema applied, and ingest authorized**        | `pnpm provision` (runs `ksor schema` + `ksor grant`)                                     |
| 4   | **A published generation**                           | `pnpm refresh` (runs `ksor ingest --flip`)                                               |

Steps 3 and 4 are [ingesting.md](./ingesting.md), and **they come before your
first deploy, not after**. A door with no published generation boots healthy and
serves an empty record — the single most common "it deployed but does not work".

The whole sequence, end to end:

```
provision the database  →  ksor schema  →  ksor grant  →  ksor ingest --flip
       →  set environment variables  →  deploy  →  verify  →  calibrate
```

Calibration is last on purpose: it measures the corpus, so the corpus has to be
in there first. Until you run it, `/health` will report `abstain OFF` and the
record will answer out-of-corpus questions instead of declining — honest, and
not what most people want to ship.

---

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
docker run --rm -p 8080:80 --env-file .env \
  -e KSOR_AUTH=disabled-public my-record
```

Two things about that command, both of which bite:

- **The image listens on 80**, which is why the mapping is `8080:80`. If your
  `.env` sets `PORT`, change the right-hand side to match.
- **`KSOR_AUTH=disabled-public` is required, even locally.** A container gets
  `$PORT` and therefore binds `0.0.0.0` — a public bind — and the
  `disabled-local` a scaffolded `.env` carries refuses there by design. Your
  laptop is not the exception. Pass it with `-e` rather than editing `.env`, so
  a plain `ksor serve` outside the container keeps its loopback posture; `-e`
  overrides `--env-file`. A real deployment sets it — or the SSO variables — in
  the host's environment, since `.dockerignore` keeps `.env` out of the image.

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

> **Importing from the Vercel dashboard: clear the Root Directory first.**
> Vercel auto-detects a root directory by looking for a framework, finds the
> Next app, and fills the field with **`system/site`**. The build then reads
> `system/site/vercel.json`, which does not exist, and fails with:
>
> ```
> Error: Project framework is set to "services", but no services are declared.
> ```
>
> The services ARE declared — in `vercel.json` at the repository root, which is
> the only place they can be, because one of them builds the site and the other
> builds a container from the root `Dockerfile`. The import screen even lists
> both, because that step reads the root file; the BUILD step uses the Root
> Directory override instead.
>
> **Set Root Directory to the repository root (`./`) and redeploy.** Nothing in
> the record changes. Found by an adopter on 2026-08-26, and it will happen on
> every dashboard import until Vercel's detection changes — the layout that
> triggers it, code under `system/`, is decision 8 and is not moving.
>
> Also confirm **Application Preset is `Services`**. Vercel Services is in Beta,
> and a project imported from Git comes back `Other` with `outputDirectory`,
> `buildCommand` and `installCommand` all `null` — which **ignores the
> `services` block entirely**.
>
> **That failure is silent, and it is worse than a missing `/mcp`.** The install
> runs, `ksor build` runs, every route prerenders, and then Vercel collects
> nothing: the deployment reports **Ready**, takes the production alias, and
> serves `404: NOT_FOUND` at every path — `llms.txt` included. The only signal
> anywhere is one line in the build log:
>
> ```
> WARNING! Build output contains no "functions" or "static" directory;
> the build may not have produced any deployable output.
> ```
>
> If you are reading that line, this is what you have. Observed on a 205-document
> record, 2026-08-26 (issue #197).
>
> **Setting the project's fields does not fix it.** Patching `outputDirectory`,
> `buildCommand` and `installCommand` on the imported project, confirming the
> values read back, and then creating a fresh Git-sourced production deployment
> — not a redeploy, which reuses the original settings snapshot and proves
> nothing — produced the same warning, the same empty output and the same 404.
> **`vercel.json` is what Vercel reads**, so the fix has to be in that file.
>
> **If it still argues, deploy the site alone** — replace the `services` block in
> `vercel.json` with the classic top-level keys, which need no preset:
>
> ```json
> {
>   "$schema": "https://openapi.vercel.sh/vercel.json",
>   "installCommand": "pnpm install --no-frozen-lockfile",
>   "buildCommand": "pnpm build",
>   "outputDirectory": "system/site/out"
> }
> ```
>
> Verified live on the same repository and machine: root `200`, `llms.txt` with
> every entry, deep pages `200`, `source_commit` stamped. That is the stricter
> posture decision 29 describes, and the door is deployed separately from the
> same `Dockerfile` — the classic keys cannot express two services, which is the
> whole reason the emitted file uses `services`.
>
> **Prefer the Git connection over `vercel deploy` while you work this out.** A
> CLI upload excludes `.git`, so `ksor build` cannot resolve a commit and every
> deploy publishes a record whose `build.lock.json` says `source: unspecified` —
> on a product whose claim is governed provenance. The Git path is the one that
> keeps it.

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

`KSOR_AUTH` has no "on" value. Auth is on when the SSO door is configured and
`KSOR_AUTH` is **absent**; setting it to either value turns auth off. If you
move from a disabled posture to a real provider, deleting the variable is part
of the change.

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
rotate later. Rotation is comma-separated, newest first, keeping the old key
until outstanding tokens age out (30 minutes):

```sh
KSOR_SNAPSHOT_KEYS="k2=<new secret>,k1=<old secret>"
```

The secret is used as literal text, never hex-decoded, and must be
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

### The site build runs `ksor build` first

`pnpm build` is `ksor build` followed by the site build. `ksor build` needs no
database: it regenerates every `index.md`, runs the record checker, and writes
`build.lock.json` — commit it — which every machine artefact stamps. A refusal
stops the build before a byte is written; `--strict` also refuses an
uncommitted input. Takedowns reach the site through the committed ledger
(`.ksor/takedowns.yaml`), which is a file in the repository — so the site build
needs no `KSOR_DB_URL` at all.

That is the design working. A takedown reaches the door instantly (it is a row)
and reaches the site at its next build (it reads the ledger), so the act that
withdraws a document is the same merged commit on both surfaces. Merge the
ledger entry, rebuild, redeploy.

**Your deploy runs it too, and that is deliberate.** `vercel.json` builds with
`pnpm build`, so the host regenerates the indexes and the lock before building
the site. The consequence is worth knowing in both directions: you can deploy
without ever having run `ksor build` yourself — the record checker still runs
there, so a record that breaks the profile still fails the deploy — but the
`build.lock.json` in your repository is not necessarily the one that shipped.
The `build_id` that DID ship is stamped into the deployed `llms.txt`.

If you want the stricter property — the deployed build_id is one a human
reviewed in a pull request — build the site alone instead:

```json
"buildCommand": "pnpm -C system/site build"
```

The site refuses `ksor-lock-missing` or `ksor-lock-stale` when the committed
lock does not describe the tree, so a deploy then fails until someone runs
`ksor build` and commits the result. That is your file to change; ksor does not
choose it for you.

## Keeping people out of the site

The door has auth ([authorization.md](./authorization.md)). The **site** is
static files, so it has none — and the way to protect it is not to add code, it
is to put something in front of it.

Three requirements, three different answers. Pick the row you actually have.

### "Everyone must sign in before reading anything"

**Put a gate in front of the origin.** Nothing in ksor changes, and it protects
every byte — HTML, `llms.txt`, images, the search index — because the request
never reaches the files.

| host          | what to turn on                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Vercel        | Deployment Protection (password, or SSO on paid plans)                                               |
| Cloudflare    | Cloudflare Access in front of the deployment                                                         |
| anything else | an authenticating reverse proxy — nginx with `auth_request`, oauth2-proxy, Caddy with `forward_auth` |

This is the strongest gate available to a static site, and the only one that
holds against `curl`. It is coarse — whole deployment, all or nothing — which is
exactly right when the answer is "this record is internal".

**A sign-in button on the site is not an alternative to this.** The gate has
already authenticated the reader before a page renders; a second login inside it
would ask the same person to sign in twice, and on its own would protect
nothing.

### "Some documents are restricted, most are not"

**Build per audience.** `KSOR_AUDIENCE=public,internal pnpm build` stages only
what that viewer may see, so the concepts it may not are **never written into
the artifact** — enforcement by absence, which is the only kind a static host
can honour. Publish the public artifact openly and the wider one behind the
gate above.

The value is a comma list of registered audiences and it must include `public`
— a bare `KSOR_AUDIENCE=internal` is refused (`ksor-viewer-omits-public`),
because every reader of a restricted build is also a reader of the open one and
a build for the restricted audience alone would silently drop every public
concept. A concept is staged when its `ksor.audience` list overlaps the
viewer's; there is no ordering between audiences to be narrower or wider than.

Plain `pnpm build` is `[public]`, so the safe thing is the default.

### "Different readers see different documents, decided per request"

Two supported answers, and a third that is yours.

**Read through the door instead.** This is the one ksor is built for. The MCP
surface already applies the audience scope **per request** and writes a
`retrieval_log` row carrying the actor for every read — per-person governance
with an audit trail, which a static site cannot have at any price. If the
requirement is "who read what, and were they allowed to", that is the door, not
the website.

**Or split the record.** Content needing per-person confidentiality inside one
tier is usually content that belongs in its own record, with its own gate. That
is what the audience model and the second-record design anticipate.

**Or fork the site — you already own it.** `system/site` is yours outright
(decision 4). Nothing stops you removing `output: "export"` and filtering per
request in your own repository. ksor's contract is unaffected; this is a
directory you own, changed the way you want it.

What you take on if you do:

> ksor's guarantee is **enforcement by absence** — a restricted document is
> never written into the artifact, and a conformance suite asserts that against
> a positive control that proves the check is not blind. A request-time filter
> is a **different** guarantee, and it becomes yours to test, because those
> suites will no longer be testing it for you. A filter that is bypassed serves
> the document; an absent file cannot be.

That is the whole trade. It is a reasonable thing to do with your eyes open, and
a bad thing to drift into because a login button suggested it.

### What does NOT work

**Hiding rendered content behind a signed-in check in the browser.** If the page
was built with the content in it, the content is in the response before any
JavaScript runs — `curl` and every crawler see it. A component that blurs or
collapses it is presenting, not protecting. If you build one, say so in its own
comment, or the next reader will take it for a gate.

## Naming the reader — the sign-in control

The site ships an optional sign-in control. Read the section above before you
turn it on, because the one thing it does not do is the thing its name suggests.

**What it does:** signs the reader in against your authorization server and puts
their name in the navbar. That is the whole feature.

**What it does not do:** restrict anything. The site is a static export — every
published document is a file the host hands to whoever asks, and no amount of
browser JavaScript changes that. If the requirement is "keep people out", the
answer is the origin gate above, and the sign-in control is not a step toward it.

So the honest use is a record already behind a gate, where the reader is
authenticated but anonymous to the page, and you want the navbar to say who they
are and offer a way out. That is worth having. It is not access control.

### Turning it on

Register a **public** client — PKCE, no secret — at the same authorization
server the door names in `KSOR_SSO_URL`, then set three variables in the
repository-root `.env`:

```sh
NEXT_PUBLIC_KSOR_SSO_URL=https://your-sso.example.com
NEXT_PUBLIC_KSOR_OAUTH_CLIENT_ID=your-client-id
NEXT_PUBLIC_KSOR_OAUTH_REDIRECT_URI=https://your-site.example.com/auth/callback
```

All three or none: with any of them missing the control does not render, which
is the default and is not an error.

They are `NEXT_PUBLIC_`, so they are **inlined at build time**. Set them before
`pnpm build`; setting them on a running site changes nothing. This also means
they are public — which is correct, because a public client has nothing secret
to leak, and it is the reason none of these is a secret.

Two things to get exactly right at the provider:

- **The redirect URI must match byte for byte**, including the scheme and any
  trailing slash. This is the failure everyone hits first, and providers report
  it as a generic callback mismatch.
- **Add the site's origin to the allowed web origins** (Auth0 calls it that;
  others call it CORS). The token exchange is a browser `fetch`, so a missing
  origin fails as CORS, not as auth.

For local work, both values are `http://localhost:3000` — and the callback is
`http://localhost:3000/auth/callback`.

Endpoints are **discovered**, not configured: the control reads
`/.well-known/oauth-authorization-server`, then OIDC discovery. Any provider
publishing either one works, which is why there is no vendor setting here.
Verified against Auth0 and against a Better Auth deployment.

### What it stores, and for how long

The session lives in `sessionStorage` — this tab, until it closes. No refresh
token is requested and none is stored.

That is deliberate, and it is a smaller footprint than the obvious alternative.
A token that unlocks nothing on this site should not outlive the visit; the
blast radius should match the benefit. If you need a longer session, you need
the gate, not a longer-lived token in a browser.

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

Measured 2026-08-23 against a live deployment on Vercel, Neon behind it, an
81-document record of 6,963 chunks, and not re-measured since:

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
