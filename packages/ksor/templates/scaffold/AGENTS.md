# AGENTS.md

The working contract for this Knowledge System of Record. CLAUDE.md points
here; every coding agent reads this file first.

## The two worlds

| Path          | What it is                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`  | **the record** — governed markdown, the owner's world, the product                                                                                                                                                                                                                                                                                                                                                     |
| `system/`     | **the system** — all code that serves the record                                                                                                                                                                                                                                                                                                                                                                       |
| `instance.md` | what this SoR is authoritative for; its prose IS the agent surface's system prompt (`ksor serve` wires the body into the MCP server's instructions). Its `name:` is the machine identity (llms.txt, citations) and its `title:` is the DISPLAY TITLE every page leads with — both are frontmatter keys, both read when the server or build STARTS, so restart `pnpm dev` after changing either (found live 2026-08-18) |

The record survives the system: `knowledge/` must stay readable and complete
even if `system/` is deleted. Dependency flows one way — the system reads the
record; the record never references the system.

`instance.md` (`format: 2`) carries a closed key set — `name` (the machine
identity), `title` (the display title and the root index's heading),
`description` (one sentence for `llms.txt` and the MCP discovery document),
`toolchain` (the upgrade stamp), `site`, `mcp_url`, `version`, and the four
serve-config blocks `database` / `embedding` / `retrieval` / `budgets`
(present only once you climb to the served MCP rung — see "Serving to agents"
below; a `pnpm dev`-only project declares none). Who may read what lives in
`.ksor/governance.yaml`, never here. The body below the frontmatter is the
MCP server's instructions in full; `pnpm check` names any other key rather
than ignoring it, and refuses a key repeated inside a group.

Authority lives in `.ksor/governance.yaml`: the audiences a document may name
(`public` is implicit), who may approve a document for `stable`, and who may
take one down. Takedowns are `.ksor/takedowns.yaml`, an append-only ledger
written by `ksor takedown` — every entry's actor is checked against the
policy, so a line appended by hand is refused exactly as the verb would refuse
it, and a deleted line is refused by `ksor build` against the file's history.

## Critical rules

1. **The site never contains authored content.** Knowledge goes in
   `knowledge/`, always. Never create markdown, MDX, or content pages inside
   `system/site` — the site _renders_ the record, it never _holds_ it.
2. **`knowledge/` is CommonMark `.md` only.** No `.mdx`, no `meta.json`, no
   framework files. A document must read cleanly in any markdown viewer.
3. **Never edit generated files** — `system/site/.source/`, `.next/`, `out/`,
   `system/site/.staged-knowledge/` (a build's per-audience copy of the
   record — edit `knowledge/`, or the next build erases the change),
   lockfiles by hand.

## Commands (run at the repo root)

```sh
pnpm install     # once, after cloning or scaffolding (also fetches the pinned `ksor` tool)
pnpm dev         # the site, hot-reloading, at http://localhost:3000
pnpm build       # static site into system/site/out/
pnpm check       # the format checker — run before handing off any knowledge change
```

## Serving to agents — the MCP rung (needs Postgres + a provider key)

`ksor serve` runs an MCP server over the record so agents get cited retrieval
with honest abstention. It is the climbed rung — not required for `pnpm dev`.
Stand it up in this order (each step's errors explain how to fix themselves):

1. **Configure `instance.md`.** One block is required, and it is already
   there, commented out — uncomment it. It names the environment variable
   holding your DSN (never the DSN itself):

   ```yaml
   database:
     dsn_env: KSOR_DB_URL
   ```

   That is enough. `embedding:` is optional and already defaults to
   `provider: gemini`, `model: gemini-embedding-001`, `dim: 1536`; write it out
   only to pin the space explicitly or to change it — and note that model and
   dim are the PERSISTED identity of the embedding space, so changing either
   later means re-embedding the whole corpus. Keep `dim` at or below 2000 — the
   schema indexes a `vector` column directly and pgvector's HNSW takes a
   `vector` to 2000. `gemini-embedding-001` emits 3072 by default, so ksor asks
   it for 1536. Google's published MTEB table runs 128–2048 and is flat at the
   top of it — 1536 scores 68.17 against 2048's 68.16 — so there is no gradient
   to climb toward the ceiling; going the other way, 768 costs 0.18 if you want
   the storage back.

   Leave `retrieval:` out for now — the gate is off and the server says so.
   Turning it on is step 4, AFTER the record is serving.

2. **Copy `.env.example` to `.env`** and fill it in — `ksor` reads it
   automatically, so nothing needs exporting, and `.env` is already gitignored.
   A real environment variable still wins over the file, so CI and production
   overrides behave normally.

   ```sh
   cp .env.example .env
   ```

   Three values matter:

   - `KSOR_DB_URL` — the Postgres store named by `instance.md`'s `dsn_env`. It
     needs the pgvector extension: `CREATE EXTENSION vector;`
   - `GEMINI_API_KEY` — the embedding provider key.
   - `KSOR_AUTH=disabled-local` — **required for a local run.** `ksor serve`
     refuses to boot unauthenticated without it, deliberately, so a server is
     never left open by accident. It binds loopback, where auth off is the
     intended dev shape. A PUBLIC deployment configures the SSO door instead —
     see the comments in `.env.example` and "Serving safely" below.

3. **Bring it up.** Once, then every time:

   ```sh
   pnpm provision   # schema (or migrate) + grant — the privileged acts, run once
   pnpm refresh # ingest the record, collect retired generations
   pnpm serve   # the MCP server (one supervised process)
   ```

   `provision` is separate on purpose: applying DDL and granting ingest are acts
   an operator performs, not side effects of starting a server. (It is not
   called `setup` because package managers claim that word for commands of
   their own, which would shadow
   it — the step would print "No changes to the environment were made" and do
   nothing.)

   **Deploying to a container runtime you do not control** (Cloud Run, Fly,
   Container Apps — anything that scales to zero and hands you a `$PORT`):
   `ksor serve` is already shaped for it, and the posture is deliberate.

   - It binds `$PORT` on `0.0.0.0` when the platform sets one.
   - It holds **no idle database connections**. The pool minimum is 0 and an
     unused connection is closed after 10s, so an idle instance keeps nothing
     open against a serverless Postgres — and a busy one still reuses
     connections instead of paying a TLS handshake per request.
   - The first request after an idle period wakes the database, and that
     connect is **retried** rather than failing: a cold start is a transient,
     not a refusal.
   - `SIGTERM` drains and exits within 8s, inside the ~10s a runtime usually
     allows before `SIGKILL`.

   What it does NOT do is open and close a connection per request. That is the
   pattern connection poolers exist to remove — the handshake alone is ~26x the
   cost of a pooled query even on localhost, before TLS — and it is not what
   managed Postgres vendors recommend for a process that serves many requests.
   Per-request connections are the right shape only for a per-invocation
   runtime (an edge function), which is a different deployment and would want
   an HTTP database driver rather than TCP.

   Set `KSOR_SNAPSHOT_KEYS` for any such deployment: without it each cold start
   mints a new signing key, so citations pinned before a scale-down stop
   validating after it.

   **`pnpm serve` serves; it does not publish.** It is `ksor serve` and nothing
   else — it opens the port against whatever generation is already active and
   needs no ingest privileges. Publishing is `pnpm ingest` (or `pnpm refresh`),
   and it is a separate step ON PURPOSE: a container that re-ingested on boot
   would pay the whole record's embedding cost on every cold start and would
   need write credentials at runtime. So in a deployment, run `pnpm provision` and
   `pnpm ingest` as DEPLOY steps and run `ksor serve` in the container, where
   it honours `$PORT` and binds `0.0.0.0`. If you skip the ingest step, the
   container serves the last generation you flipped — and on a FIRST deploy,
   that is nothing at all.

   Every step is re-runnable, so this is also how you **refresh after editing
   `knowledge/`**: an applied schema reports "already applied", an existing
   grant reports "already granted", and ingest builds a fresh generation.

   **`pnpm refresh` after editing `knowledge/`; `pnpm serve` to bring the
   server up.** Two commands, and the split is the point: serving must not
   publish, or a restart, a crash-loop or an autoscaling event each republishes
   your record. Everything is re-runnable and reports the state it found rather
   than failing — an applied schema says "already applied", an existing grant
   says "already granted".

   A refresh on an unchanged record costs **nothing at all**: ingest compares
   the corpus it just read against the generation already serving and, when
   they are identical at the same commit, consumes no generation and writes no
   rows ("unchanged — generation N already serves this corpus"). Edit a
   document and the next refresh builds a generation for it, re-embedding only
   what changed and carrying the rest forward by content hash — so an ordinary
   edit makes a handful of provider calls, not a corpus-worth.

   Generations do accumulate as you edit. Reap the superseded ones when you
   think of it, or on a schedule:

   ```sh
   pnpm exec ksor gc --instance instance.md
   ```

   The individual verbs (`pnpm schema`, `pnpm grant`, `pnpm ingest`,
   `pnpm gc`) are what `provision` and `refresh` are made of. Reach for them
   when duties are split — a deploy step that ingests while a different process
   serves, or a DBA who holds the credentials that authorize ingest — not as a
   daily choice.

4. **Turn the abstention gate on — deliberately, once it serves.** This is the
   step that makes "not in this corpus" a real answer, and it is measured, never
   guessed:

   ```sh
   pnpm exec ksor calibrate --instance instance.md
   ```

   It prints a recommended `vector_floor` for THIS corpus in THIS embedding
   space. Paste the number in and restart:

   ```yaml
   retrieval:
     vector_floor: 0.55 # measured by ksor calibrate on <date>
   ```

   Never copy a floor from another corpus — recalibrate, and record the
   measurement beside the number. Writing `vector_floor: uncalibrated` declares
   the intent to gate WITHOUT a measurement, and every serve refuses until a
   number replaces it; that is the fail-closed posture, not a starting point.

```sh
pnpm schema      # apply the DDL (once)
pnpm grant       # authorize ingest for this corpus (once)
pnpm ingest      # embed knowledge/ into a generation and activate it
pnpm serve       # run the MCP server; any other verb: pnpm exec ksor <verb>
```

### How serving updates work (the generation model)

Each `ksor ingest` builds a **fresh generation** (invisible until activated) and
carries every unchanged embedding forward from the last complete generation —
so **re-ingest is safe and cheap**; only changed or failed chunks re-embed.
`--flip` swaps the active pointer, guarded by a catastrophic-shrink check
(`KSOR_MAX_SHRINK`, default `0.15` — a flip that drops more than 15% of nodes
refuses; override with `KSOR_ALLOW_SHRINK=1` when the shrink is intended). The
previous generation stays as a rollback target; `pnpm exec ksor gc` collects
abandoned ones.

### Serving safely (fail-closed posture)

`pnpm serve` **refuses to boot unauthenticated** — there is no auth-off
default. A local run says so deliberately with `KSOR_AUTH=disabled-local` and binds
loopback, which is the intended dev shape. A **public**
bind refuses to boot unless auth is configured (`KSOR_SSO_URL` +
`KSOR_MCP_RESOURCE_URL` + `KSOR_JWT_ALLOWED_AUDIENCES`, making it an OAuth
Resource Server) OR you deliberately set `KSOR_AUTH=disabled-public`.
Never let a dropped auth variable silently ship an open door. On a non-loopback
bind, set `KSOR_ALLOWED_HOSTS` / `KSOR_ALLOWED_ORIGINS`; on more than one
replica, set a shared `KSOR_SNAPSHOT_KEYS` (unset ⇒ a per-process key, so a
search token minted by one replica fails on another).

Three things worth being deliberate about:

- **`KSOR_AUTH=disabled-public` serves your whole record to anyone
  who can reach the port.** It exists for deployments fronted by your own
  gateway or network policy. If nothing else is in front, do not set it.
- **Set `KSOR_SSO_ISSUER` when your SSO stamps a stable `iss`.** Audience is
  always enforced against `KSOR_JWT_ALLOWED_AUDIENCES`; naming the issuer adds
  one more check for the cost of one variable.
- **The signing keys are DISCOVERED; you rarely set `KSOR_JWKS_URL`.** The door
  reads your SSO's own metadata document — RFC 8414
  (`/.well-known/oauth-authorization-server`), then OpenID Discovery
  (`/.well-known/openid-configuration`) — so Auth0, Okta, Entra, Keycloak,
  Cognito, Google and Better Auth all work unmodified. The boot report's `keys`
  line names which document answered and where the keys came from; set
  `KSOR_JWKS_URL` only to override that, or when your SSO publishes no metadata
  at all.

### What a CLIENT has to do

Once the SSO door is configured (the three variables above), the server is an
OAuth **Resource Server**, which means a client is not told the authorization
server — it discovers it. Nothing here needs configuring beyond those variables;
this is what your agents will experience, and what to check when one cannot
connect. With `KSOR_AUTH=disabled-local` — the local default `.env.example` ships —
none of it applies: there is no challenge and the metadata document answers 404,
because there is no authorization server to point at.

1. The client calls `POST /mcp` with no token and gets **401** carrying

   ```
   WWW-Authenticate: Bearer resource_metadata="https://<your-host>/.well-known/oauth-protected-resource/mcp"
   ```

   That header is the whole handshake: it names a DOCUMENT, not the resource.

2. The client fetches that document and finds the record's resource identifier
   and its authorization server:

   ```json
   {
     "resource": "https://<your-host>/mcp",
     "authorization_servers": ["https://your-sso.example.com"]
   }
   ```

   Those two values are `KSOR_MCP_RESOURCE_URL` and `KSOR_SSO_URL`.

3. The client gets a token from that authorization server, asking for THIS
   record as the resource (RFC 8707: `resource=https://<your-host>/mcp`), and
   sends it as `Authorization: Bearer <token>`.

Every 401 carries that same header, not just the first one — including the one
your clients will hit most often, a token that expired mid-conversation. It
arrives as `Bearer error="invalid_token", resource_metadata="…"`, so a client
knows to refresh rather than to retry the dead token. A **503** is deliberately
_not_ challenged: an unreachable key set is our outage, not your token's fault,
and telling a client to re-authenticate over it would send a perfectly good user
back through a login.

The one thing that goes wrong here goes wrong quietly: a token minted for a
different audience is a perfectly valid token, and this door rejects it. The
`aud` claim must match one of `KSOR_JWT_ALLOWED_AUDIENCES` — normally the same
value as `KSOR_MCP_RESOURCE_URL` — because a bearer accepted for any audience is
a bearer stolen from one service and replayed against this one. If a client
authenticates fine and still gets 401, compare its token's `aud` against that
list before looking anywhere else.

Tokens must be signed **RS256**; nothing else is accepted, and opaque tokens are
not supported (there is no introspection call). When your SSO rotates its
signing keys, an unknown key id answers **503**, not 401 — the token may well be
good and the door's key set merely stale, so a client should retry rather than
send the user back through a login.

## Shaping the agent surface — `system/gateways/content.ts`

That file is this record's MCP registration — ordinary `registerTool` with
ordinary zod. It is yours, and it is **deletable**: without it the door serves
the same defaults.

Edit it because an agent pays for this surface out of its context window, twice.
The definitions depend only on the code, so they are exact for every record
(re-measured 2026-08-25 from the served `tools/list`); the per-call figures are
the 2026-08-23 measurement against a live 81-document record, plus the
governance block every hit now carries:

|                                  |                                |
| -------------------------------- | ------------------------------ |
| all three tool definitions       | ~4,054 tokens, always resident |
| one `search` at `k=10` (default) | ~4,196 tokens per call         |
| one `search` at `k=5`            | ~2,330 tokens per call         |

Three edits pay for themselves:

- **Delete a tool nothing calls.** Removing `outline` and `read` gives back
  ~2,152 tokens for the whole session.
- **Say what this record covers**, above `FLOOR.search`. It is how an agent with
  several records attached picks yours; name the subject AND the boundary.
- **Set `k`** in the input schema — it is the lever on reply size.

```ts
description: `Leave, benefits, conduct. Not product docs.\n\n${FLOOR.search}`,
inputSchema: z.object({
  query: z.string(),
  k: z.number().int().default(5),
  min_trust_tier: z.enum(TRUST_TIERS).optional(),
}),
```

Keep `min_trust_tier`. Dropping it does not weaken the record — the handler
still applies `unverified` and this deployment's own floor — but it takes away
the only way a caller can ask to be answered ONLY from what a human reviewed,
and the door says so at boot with a notice naming the tool and the line to
paste, rather than failing quietly.

You can add your own tools with `registerTool` too — but be clear-eyed: ksor
makes no provenance claim about a tool it did not hand you a handler for.

What you cannot change is deliberate: the handlers, the output schemas, and the
`FLOOR` text. Your prose goes ABOVE the floor, never instead of it — the floor
tells an agent how to read an abstention and that corpus content is untrusted,
and a record that dropped it would answer without ever declining.

Because that is a template literal in a file you own, the door checks its own
surface at boot and refuses to start if a guarantee is gone:
`ksor-gateway-floor-missing`, `ksor-gateway-no-tools`,
`ksor-gateway-unloadable`. Full detail:
`node_modules/@panaversity/ksor/docs/tool-surface.md`.

## Withdrawing a document — `ksor takedown`

A takedown is the one governance act that must reach EVERY surface at once. It
is written to the committed ledger `.ksor/takedowns.yaml` FIRST and to the
database denylist second, in one act — so a record with no database can
withdraw a document, and the site reads the withdrawal from the repository
rather than from anything exported.

```sh
pnpm exec ksor takedown --instance instance.md --actor human:you <stable-id> --reason "legal request 2026-08"
pnpm exec ksor takedown --instance instance.md --actor human:you <stable-id> --reason "..." --scope subtree
pnpm exec ksor takedown --instance instance.md --list      # what is currently denied
pnpm exec ksor takedown --instance instance.md --ledger    # who denied what, when
pnpm exec ksor takedown --instance instance.md --actor human:you --revoke <entry-id> --reason "..."
```

The stable id is what a search result reports as `provenance.stable_id`, and it
is `knowledge/<path-without-.md>` — always, since path is identity.
`--scope subtree` withdraws a section and everything beneath it, including
documents added later. `--revoke` takes the id of a LEDGER ENTRY, which
`--ledger` lists, not a stable id: the ledger is append-only, so a lift is a new
entry rather than a deleted line. `--removed <entry-id>` records that a denied
document was deleted, and `--apply` writes the rows for entries that reached
the database late.

`--actor` names who performed the act, and a denial, a revocation or an
amendment is REFUSED without it. There is no default: a name taken from the
environment reads like a person and is whatever the shell happened to be
(`runner` under CI, `root` in a container), which is worse than no name at all
in the one row that exists to record who did this. It must be a well-formed
actor (`human:<handle>` or `process:<id>` — a bare name is refused) and
`takedown_authorities` in `.ksor/governance.yaml` must name it. The same check
runs over every entry in the ledger at `pnpm check`, `ksor build` and ingest, so
a line appended by hand in a pull request is refused exactly as the verb would
refuse it. Read-only modes
(`--list`, `--ledger`) need nothing.

**The MCP door stops serving it immediately. The SITE stops at its next
build** — the site reads the committed ledger (`.ksor/takedowns.yaml`), not
the database, and so needs no database access to honour a takedown. After a
takedown, merge the ledger entry, rebuild and redeploy the site, or the human
surface keeps publishing what the agent surface already refuses.

## Publishing

`pnpm build` emits a fully static site (`system/site/out/`) deployable to
any host — Vercel reads the shipped `vercel.json` (deploy from the repo
ROOT, never `system/site/`), and every other host just serves the folder.
`pnpm build` runs `ksor build` first — every `index.md` regenerated, the
record checked, `build.lock.json` written (commit it: it is the provenance
every machine artefact stamps) — and a refusal stops the build before a byte
is written. `ksor build --strict` additionally refuses an uncommitted input
(`ksor-build-dirty`), which is the posture for a release.
`KSOR_BASE_PATH=/repo pnpm build` targets sub-path hosting. With audiences
registered in `.ksor/governance.yaml`, plain `pnpm build` is the `public`
viewer; `KSOR_AUDIENCE=public,<audience> pnpm build` — a comma list, always
including `public` — builds for a wider viewer, and that build belongs
behind that audience's own access control, never on a public host.
Details in README → Deploying.

**A build publishes nothing until a human approves.** The five starter
documents ship `status: draft`, and §2.5 admits a draft to NO surface of a
build — not the page, not the sidebar, not the search index, not `llms.txt`.
So the first `pnpm build` of a fresh record emits a site with zero document
pages and an empty `## Documents` section, reports `0 admitted to a machine
surface`, and is working correctly. `pnpm dev` shows the drafts, which is what
the preview is for. Never approve on the owner's behalf to make a build look
fuller: approving is `status: stable` plus a `ksor.approval: { by, at }` naming
an actor `.ksor/governance.yaml` authorises, and it is the owner's act. Ask
them, then write down what they said (`.agents/skills/intake-interview/`).
`KSOR_DRAFTS=show pnpm build` publishes drafts to the HUMAN surface only, marks
the build `noindex` and records itself in `build.lock.json` — a review link,
never a way to ship.

### The MCP door is a container

The other surface is a live process, so it ships as one. `Dockerfile` and
`.dockerignore` are yours, at the repo root, and they name no host:

```sh
docker build -t my-record .
docker run --rm -p 8080:80 --env-file .env my-record
```

That image runs on Cloud Run, Fly, Render, ECS, Kubernetes or a VPS unchanged.
`vercel.json` declares BOTH surfaces — a `site` service built from
`system/site/out/` and a `door` service pointing at that same `Dockerfile` —
with rewrites putting the door on `/mcp`, `/health`, `/ready` and the
`/.well-known/oauth-protected-resource` document, and the site on everything
else. Two rules if you edit it: the `/(.*)` catch-all must stay LAST, and do
not add a project-level `trailingSlash` — the site's Next config already sets
it, and at project level it 308-redirects `POST /mcp`, which breaks the door.

The image deliberately excludes `.env` (a baked DSN is published to anyone who
can pull the image), `knowledge/` (the door reads Postgres, never the folder)
and `system/` (the other surface).

**Deploying does not publish.** A container that ingested on boot would pay the
whole record's embedding cost on every cold start and need write credentials at
runtime. So `pnpm refresh` is a DEPLOY step you run — from your machine or from
CI — and a first deploy without it serves an empty record. Full walkthrough:
`node_modules/@panaversity/ksor/docs/deploying.md` and `…/docs/ingesting.md`.

## Writing knowledge

- One document per file under `knowledge/`; the path is the document's
  identity and its URL — ascii lowercase, digits, hyphens; no spaces or
  special characters; no two files differing only in case; never both
  `foo.md` and a folder `foo/`. The `title:` carries the document's real
  name in any language — the filename is the address, not the name. Every
  folder's `index.md` is GENERATED by `ksor build` (an OKF §8 index of the
  folder) and committed — never edit one, never put prose in one; a folder's
  own introduction is a named document inside it, such as `overview.md`.
  `log.md` and `README.md` are reserved names.
- The frontmatter `title` IS the rendered page heading — never repeat it as
  an `# h1` in the body, and quote any value containing a colon
  (`title: "Note: quoting"`).
- Frontmatter is the KSoR Profile of OKF (the record spec's §2). Required on
  every document: `type` (`Document` unless the knowledge is a `Policy`,
  `Procedure`, `Control`, `Standard`, `Definition`, `Decision Record`,
  `Example` or `Attested Computation` — those reserved types also require
  `sources` and `ksor.owner`), `title`, `description` (one sentence), `status`
  (`draft | stable | deprecated`) and `ksor.audience` (a list — `[public]`, or
  audiences registered in `.ksor/governance.yaml`; never omitted, never
  inferred). A `stable` document carries `generated: { by, at }` and
  `ksor.approval: { by, at }` by an actor the policy authorises, with
  `generated.at` no later than the approval; a `deprecated` one carries
  `ksor.deprecated: { by, at }` and usually `ksor.superseded_by: <id>`
  (a stable document every reader of this one may read). Optional: `order`
  (reading position), `sources` (`{ id, resource, title }`, cited in the body
  as GFM footnotes `[^id]`), `verified` (`[{ by, at }]` — sets the trust
  tier: none → unverified, machine actors → machine-confirmed, any `human:`
  → human-reviewed), `stale_after`, `ksor.effective_from`. Actors are
  `human:<id>`, `process:<id>` or `<producer>/<version>`; `team:<id>` only in
  `ksor.owner`. Every timestamp is an ISO 8601 instant with an offset
  (`2026-08-25T09:00:00Z`) — never a bare date. Unknown keys are preserved, unless
  the name is one edit from a profile key — `stale_afer:` is refused rather
  than kept, because a preserved near miss is the key it meant, failing open.
  The `ksor:` block's own key set is closed. The pre-profile keys
  `visibility`, `owner`, `provenance`, `effective`, `superseded` and
  `superseded_by` are refused by name and `ksor migrate` moves them; `id` and
  `name` it deletes (the path is the identity); `sor_id` it REFUSES rather
  than drops, because retiring it changes the document's stable id and any
  takedown keyed on the old one must be re-denied against the new one first.
- **Each page says how long it takes to read**, counted from the document's own
  words when the site is built. Fenced code and frontmatter do not count toward
  it, so a short page carrying a long example is not reported as a long read.
  Nothing to author — it is derived. It sits with the owner and the effective
  date, in the row under the title; a document with a SUMMARY moves it onto
  that view's own strip instead, where it reports the view you are reading
  rather than the document. Each tab names its own figure to a screen reader,
  so the cost of each view is available without switching to it.
- **The governance keys are rendered, so they are worth filling in.** Each
  page shows its owner and effective date under the title, lists every
  `sources` entry separately at the foot, and — for a deprecated document —
  carries a notice above the title naming its successor and linking to it. A
  key you leave off renders nothing at all: the site never invents a value, so
  a missing owner reads as missing rather than as unowned.
- **The agent surface carries them too — by EXCLUDING what it must not
  hand over.** `llms.txt` and `llms-full.txt` list only what the §2.5 table
  admits to a machine surface: stable, effective, unexpired, undenied. A
  draft, a deprecated document and one whose `stale_after` has passed are not
  entries at all, so an agent is never handed a withdrawn document as plain
  prose. `llms-full.txt` serves each document's own frontmatter intact, plus
  the derived `trust_tier` and this build's stamps — so what an agent reads
  carries the same governance a reader sees on the page.
- **Don't want any of it on the published pages?** Set `governance: false`
  under `site:` in `instance.md`. The record keeps every key — the agent
  surface and your audit trail still read them, and `llms.txt`/`llms-full.txt`
  keep publishing them — and the pages simply stay plain. One consequence worth
  knowing: the home page shows the agent surface VERBATIM in its panel, so the
  keys stay visible there even with this off. That panel's whole claim is that
  it is the bytes an agent is served, and editing them to match a page setting
  would make it lie. Remove the panel if you need the front page silent too. The supersession notice is the one thing it does not hide: a reader
  handed a replaced document with no word of its successor has been misled.
- **`status` is shown only when it is a caveat.** `deprecated` appears as a
  small label; `stable` shows nothing, because a reader already assumes a
  document in the record is current — so the label stays rare enough to be
  noticed on the pages where it matters. `draft` carries the same label, but
  only under `pnpm dev`: a BUILT site has no draft page to label it on.
- `ksor.audience` lists who may read a document; a viewer holds a list that
  always includes `public`, and the document is visible when the two overlap.
  Every identifier but `public` must be registered in
  `.ksor/governance.yaml` — an unregistered one is refused, because a typo
  reads as a restriction. `pnpm check` refuses any link, `ksor.superseded_by`
  pointer or summary that reaches a document not every reader of the source
  may read (`ksor-link-widens`) — the leak no single build can catch, because
  the build that publishes the link has already dropped its target.

  **Publication, not authorship: anyone who can clone the repository reads
  every document regardless of frontmatter; if someone must not read a
  document and can clone, the answer is a second repository.**

- A replaced document is marked `status: deprecated` with
  `ksor.deprecated: { by, at }` (the owner or a takedown authority) and
  `ksor.superseded_by:` naming its successor by id (`policies/refunds-v2`) —
  deprecated documents are never deleted. The successor must exist, be
  `stable`, and be readable by every reader of this document, or the pointer
  strands them (`ksor-supersession-strands`).
- Images and assets live in `knowledge/` beside the document that uses them,
  referenced by relative links. A relative link must never leave `knowledge/`.
- **Study attachments.** A document may carry four optional companions named
  after it, in the same folder: `<doc>.summary.md` (a short précis),
  `<doc>.slides.yaml` (a presentation), `<doc>.flashcards.yaml` (a recall deck)
  and `<doc>.quiz.yaml` (a multiple-choice check). The summary appears as a
  second tab beside the document's own words; the presentation appears after
  the document's INTRODUCTION — everything before its first `##` section —
  because a deck is the shape of the thing and belongs where the reader has
  just been told what the thing is; the deck and the quiz appear at the END,
  because those are used after reading. None of them appears anywhere
  else in the site.

  An attachment is **part of its document**, not a document. It has no URL of
  its own, no sidebar row, no line in `llms.txt`, and no identity an agent can
  cite — so a summary's frontmatter is exactly `type: Summary` and nothing
  else (the checker refuses any other key), and every attachment takes its
  audience and any takedown from its parent. Restrict the
  document and its summary and deck go with it; there is no way to publish a
  summary more widely than the document it summarises. An attachment whose
  document is missing is refused, by `pnpm check` and by `pnpm build` alike.

  A deck is YAML, and the extension is exactly `.flashcards.yaml` — `.yml` is
  refused by name:

  ```yaml
  deck:
    title: Expense approvals
    description: Recall checks for the approvals policy.
  cards:
    - front: Who approves a purchase above the threshold?
      back: A second approver, independent of the requester.
      why: Optional — a prompt shown before the answer.
  ```

  No `id:` anywhere, on the deck or a card: the path is the deck's identity,
  and a card's identity is its own text. Edit a card and only that card's
  review progress starts again; the rest is untouched.

  **A card may only say what its document says.** The summary and the deck are
  ways of rehearsing the record, never a second source — a card asserting
  something its document does not is a claim nothing governs and no agent can
  cite. Ask your coding agent to write them from a document and to check every
  answer back against it.

  Review scheduling uses a simple interval ladder (an SM-2 variant): a missed
  card returns in about a minute, a recalled card's interval grows by roughly
  2.5x each time. It is not FSRS and makes no retention guarantee. Progress is
  kept in the reader's own browser, so it is per-person and per-device, and it
  is not part of the record.

  A **quiz** is the same idea with an answer to choose. Each question carries
  two to six options, `answer` as the zero-based index of the correct one, a
  required `explanation`, and an optional `source` naming where in the document
  the answer lives:

  ```yaml
  quiz:
    title: Expense approvals
    questionsPerRound: 10 # optional; the default
  questions:
    - question: Who approves a purchase above the threshold?
      options:
        - A second approver, independent of the requester
        - The requester's own manager, in every case
        - The finance team, after the purchase completes
      answer: 0
      explanation: Why that is right, and why the others are not.
      source: Approvals — thresholds
  ```

  The reader sees whether they were right **immediately**, then the
  explanation — a quiz here teaches through the mistake, and it does not
  certify anybody, so there is no pass mark. Answers stay in the reader's
  browser and are sent nowhere. A bank larger than `questionsPerRound` is drawn
  from at random and offers another round; a smaller one is simply asked in
  full.

  **`pnpm build` refuses a quiz a reader could pass without reading** (the
  audit runs in the site build, not in `pnpm check`), and this is worth knowing
  before you write one, because it is easy to trip by accident:

  | Refusal                    | Means                                                 |
  | -------------------------- | ----------------------------------------------------- |
  | `ksor-quiz-answer-bias`    | more than 60% of answers sit at one option position   |
  | `ksor-quiz-length-bias`    | picking the longest (or shortest) option usually wins |
  | `ksor-quiz-answer-run`     | four or more questions in a row share an answer       |
  | `ksor-quiz-contradiction`  | an explanation calls the marked answer wrong          |
  | `ksor-quiz-duplicate-stem` | two questions open with the same 60 characters        |

  So: move the correct answer around, and keep the options close in length.
  The ratio rules do not apply below five questions, where spreading answers
  would mean the checker choosing them for you. These checks come from the
  predecessor, where the same mistakes shipped and were found by readers — one
  quiz had every correct answer in the same position across 451 questions.

  A **presentation** is slides the record owns. Ask your coding agent for one
  rather than writing it by hand — `make slides for knowledge/<path>.md` runs
  the `make-slides` skill, which reads the document, writes the deck, checks
  every claim back against it, and tells you what it left out:

  ```yaml
  slides:
    title: Expense approvals
    description: The 15-minute version, for a room.
  deck:
    - heading: When two copies disagree, one wins
      bullets:
        - Two approvers above the threshold, always
        - The threshold is per invoice, including tax
      note: Spoken, never shown. Pause here — people remember this one wrong.
  ```

  `heading` is required and should be a claim rather than a label; `lead` is
  one sentence for a single-point slide; `bullets` caps at six because a slide
  someone reads aloud is a slide nobody listens to; `note` is what the
  presenter SAYS and never appears on the slide, including in fullscreen.

  The slides render in the page — no third party, no request to anyone, and
  every slide is in the shipped HTML, so a reader without JavaScript still gets
  the whole deck. Because they live in the record they are reviewed in the same
  pull request as the document, versioned with it, and withdrawn with it.

  **A deck you keep elsewhere** can be pointed at instead — `slides.url:` and
  no `deck:`. The embed url is derived for Google Slides, Canva and SlideShare;
  anything else needs an explicit `embed:` or renders as a link. The url must
  be `https` (a browser blocks a mixed-content frame silently), and the frame
  loads on CLICK, so nothing is requested from the host until a reader asks.
  Declaring both `deck:` and `slides.url:` is refused — two presentations with
  nothing to say which one governs.

- **One instruction per tool, as tabs.** When a document has to say the same
  thing two ways — one command for one agent, another for another — put each in
  its own fenced block and give the fence a `tab`:

  ````markdown
  ```bash tab="Claude Code" tab-group="agent"
  curl -fsSL https://claude.ai/install.sh | bash
  ```

  ```bash tab="OpenCode" tab-group="agent"
  curl -fsSL https://opencode.ai/install | bash
  ```
  ````

  Consecutive blocks that declare a `tab` become one tab group. This is still
  CommonMark: a fence's info string is free text, so any other markdown reader
  shows both blocks one after another — correct, just without the picker.

  **`tab-group` is what makes the choice stick.** Blocks sharing a group name
  switch together across the whole page and the choice is remembered for the
  reader's next visit, so a document with ten tabbed sections is one decision
  rather than ten. Leave it off and each group is independent, which is almost
  never what you want. Use the same group name for the same axis throughout a
  record.

  A tool the site knows gets its own colour and mark on its tab; anything else
  renders in the site's accent. The list lives in `system/site/app/global.css`
  and is yours — adding a tool is one colour and one mark.

- **A passage the reader must not miss, as a CALLOUT.** GitHub's alert syntax —
  a blockquote whose first line is the kind in brackets:

  ```markdown
  > [!WARNING]
  > This threshold changed in March. The figure below is the old one.
  ```

  Five kinds: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`. The site tints
  the panel in that kind's colour and rules its left edge; every other reader
  of the record — GitHub, a plain editor, `/md/`, `llms-full.txt` — shows an
  ordinary blockquote carrying a visible label, so nothing is lost and nothing
  becomes punctuation.

  **Not `:::warning`.** That form is a dialect: a record written in one renders
  as literal colons in every reader except the one site that understands it.

- **A long line is the reader's to unwrap.** Nothing to author — a fenced block
  wider than the column gets a button beside its copy button that wraps it, and
  a block that fits gets no button at all.

- Copy load-bearing values (numbers, thresholds, dates) exactly from their
  source, name the source in `sources`, and cite it from the claim with a GFM
  footnote whose label is that source's `id`.

### Structuring the record

- A folder per topic. Its `index.md` is GENERATED by `ksor build` — an OKF §8
  map of the folder — so a folder's own introduction is a named document
  inside it, such as `overview.md`, and the folder sorts where its
  lowest-`order:` document does.
- Sidebar position is the governed `order:` key: documents that declare it come
  first, ascending; the rest follow in name order.
- One order drives every surface — the sidebar, `llms.txt`, the home page's
  first-document link, and the MCP `outline` tool an agent reads to decide what
  to read first. Set it once and they agree. The door picks up a reorder at the
  next `pnpm refresh`, which costs no embedding: only the ordering changed.
- Never `meta.json` or `sidebar_position`: the checker refuses framework files
  in the record, which has to read the same without the site.

## Skills

- `.agents/skills/intake-interview/` — first run: interview the owner and
  write `instance.md` together.
- `.agents/skills/add-sources/` — turn source material (documents, pages,
  notes) into governed knowledge.
- `.agents/skills/make-slides/` — generate a presentation from one document
- `.agents/skills/make-summary/` — write a document's summary and attach it
  and attach it, so it renders on that document's page.
- `.agents/skills/format-checker/` — the rules above, as a program;
  `pnpm check` runs it and its errors explain how to fix themselves.

## Customizing the site

You own `system/site/` outright — these are the seams, cheapest first:

- **Display title** — `instance.md`'s `title:` key (the intake interview
  writes it). Headline, navbar, and browser title follow on restart.
- **Accent color** — the one brand pair in `system/site/app/global.css`
  (`--primary` and `--primary-foreground`, light and dark); every accented
  element follows, in the shell and in every shadcn component alike.
- **Logo and favicon** — replace `system/site/app/icon.png`; the tab icon
  and the home-page mark are the same file.
- **Components** — the site is a shadcn/ui project (`system/site/components.json`),
  so `pnpm dlx shadcn@latest add <name>` writes a component into
  `system/site/components/ui/` that you then own like everything else here.
  Fumadocs reads the same tokens (its `shadcn` preset maps every `--color-fd-*`
  onto the shadcn variable of the same role), so a registry component and the
  documentation shell around it stay one palette.
- **Anything deeper** — edit the site like the Next.js app it is; the only
  rule that survives customization is critical rule 1. The whole shell is
  replaceable behind a five-clause contract: render the record, `llms.txt`,
  per-page md artifacts, browser smoke, and no authored content.

## What this project owns

Everything. The scaffold was emitted by `ksor init` (version recorded in
`instance.md`) and belongs to this repository outright — change anything in
`system/` deliberately; the knowledge in `knowledge/` was always yours.
