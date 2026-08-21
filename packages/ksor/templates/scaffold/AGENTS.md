# AGENTS.md

The working contract for this Knowledge System of Record. CLAUDE.md points
here; every coding agent reads this file first.

## The two worlds

| Path          | What it is                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`  | **the record** — governed markdown, the owner's world, the product                                                                                                                                                                                                                                                                                                                             |
| `system/`     | **the system** — all code that serves the record                                                                                                                                                                                                                                                                                                                                               |
| `instance.md` | what this SoR is authoritative for; its prose IS the agent surface's system prompt (`ksor serve` wires the body into the MCP server's instructions). Its `name:` is the machine identity (llms.txt, citations) and its body `# H1` is the DISPLAY TITLE every page leads with — both read when the server or build STARTS, so restart `pnpm dev` after changing either (found live 2026-08-18) |

The record survives the system: `knowledge/` must stay readable and complete
even if `system/` is deleted. Dependency flows one way — the system reads the
record; the record never references the system.

`instance.md` carries a closed key set — `format`, `name`, `ksor`, `site`,
the optional pair `audiences` + `default_visibility` (the record's reader
audiences, ordered least- to most-restricted with `public` first, and the one
a document takes when it names none — declared together or not at all), and
the four serve-config blocks `database` / `embedding` / `retrieval` / `budgets`
(present only once you climb to the served MCP rung — see "Serving to agents"
below; a `pnpm dev`-only project declares none). Everything else that matters
about the instance is the prose below the frontmatter; `pnpm check` names any
other key rather than ignoring it.

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
   later means re-embedding the whole corpus. Keep `dim` at or below 2000: the
   pgvector HNSW index refuses more, and `gemini-embedding-001` can emit 3072.

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
   - `KSOR_AUTH_DISABLED=1` — **required for a local run.** `ksor serve`
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
   called `setup` because `pnpm setup` is pnpm's own command and would shadow
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
default. A local run says so deliberately with `KSOR_AUTH_DISABLED=1` and binds
loopback, which is the intended dev shape. A **public**
bind refuses to boot unless auth is configured (`KSOR_SSO_URL` +
`KSOR_MCP_RESOURCE_URL` + `KSOR_JWT_ALLOWED_AUDIENCES`, making it an OAuth
Resource Server) OR you deliberately set `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1`.
Never let a dropped auth variable silently ship an open door. On a non-loopback
bind, set `KSOR_ALLOWED_HOSTS` / `KSOR_ALLOWED_ORIGINS`; on more than one
replica, set a shared `KSOR_SNAPSHOT_KEYS` (unset ⇒ a per-process key, so a
search token minted by one replica fails on another).

Two things worth being deliberate about:

- **`KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1` serves your whole record to anyone
  who can reach the port.** It exists for deployments fronted by your own
  gateway or network policy. If nothing else is in front, do not set it.
- **Set `KSOR_SSO_ISSUER` when your SSO stamps a stable `iss`.** Audience is
  always enforced against `KSOR_JWT_ALLOWED_AUDIENCES`; naming the issuer adds
  one more check for the cost of one variable.
- **Set `KSOR_JWKS_URL` unless your SSO is Better Auth.** The signing keys are
  fetched from `<KSOR_SSO_URL>/api/auth/jwks` by default, which is Better
  Auth's layout. Auth0, Okta, Entra, Keycloak and Cognito publish theirs
  elsewhere, and a wrong JWKS URL fails as a transient fetch error — the door
  boots clean and every request 503s with nothing naming the cause.

## Withdrawing a document — `ksor takedown`

A takedown is the one governance act that must reach EVERY surface at once.
It needs the database (the denial is a row, not a file), so it belongs to the
served rung.

```sh
pnpm exec ksor takedown --instance instance.md <stable-id> --reason "legal request 2026-08"
pnpm exec ksor takedown --instance instance.md <stable-id> --reason "..." --subtree
pnpm exec ksor takedown --instance instance.md --list      # what is currently denied
pnpm exec ksor takedown --instance instance.md --ledger    # who denied what, when
pnpm exec ksor takedown --instance instance.md --revoke <stable-id>
```

The stable id is what a search result reports as `provenance.stable_id` — for
most documents that is `knowledge/<path-without-.md>`. `--subtree` withdraws a
section and everything beneath it, including documents added later.
`--actor NAME` names who performed the act in the ledger; it defaults to the
operating user.

**The MCP door stops serving it immediately. The SITE stops at its next
build** — the site reads a file, not the database, and `pnpm build` refreshes
that file for you (`pnpm export-denylist`). So after a takedown, rebuild and
redeploy the site, or the human surface keeps publishing what the agent
surface already refuses.

## Publishing

`pnpm build` emits a fully static site (`system/site/out/`) deployable to
any host — Vercel reads the shipped `vercel.json` (deploy from the repo
ROOT, never `system/site/`), and every other host just serves the folder.
Once `instance.md` declares a `database:`, `pnpm build` needs `KSOR_DB_URL` as
well: it runs `pnpm export-denylist` first, which asks the database what has
been withdrawn and writes `.ksor-denylist.json`. Without the DSN the build
refuses rather than publish a document someone took down.
`KSOR_BASE_PATH=/repo pnpm build` targets sub-path hosting. With
`audiences:` declared, plain `pnpm build` is always the public tier;
`KSOR_AUDIENCE=<audience> pnpm build` builds a wider tier that belongs
behind that audience's own access control, never on a public host.
Details in README → Deploying.

## Writing knowledge

- One document per file under `knowledge/`; the path is the document's
  identity and its URL — ascii lowercase, digits, hyphens; no spaces or
  special characters; no two files differing only in case; never both
  `foo.md` and `foo/index.md`. The `title:` carries the document's real
  name in any language — the filename is the address, not the name.
- The frontmatter `title` IS the rendered page heading — never repeat it as
  an `# h1` in the body, and quote any value containing a colon
  (`title: "Note: quoting"`).
- Frontmatter: `title` and `status` (`draft | review | approved | superseded`)
  are required. `owner` and `provenance` (a list naming real sources) are
  strongly encouraged — they become required as this project climbs the
  governance ladder. `description`, `visibility` (below), `order` (sidebar
  position), `effective` (the date the document takes effect) and `superseded`
  (a legacy marker — prefer `status`) are available. No other keys; never
  `id:` or `name:` — the path is the identity.
- `visibility:` names the one audience a document belongs to — a single value
  from `instance.md`'s `audiences:`, never a list, and orthogonal to `status:`
  (an approved document can be restricted, and a draft is not hidden). Leave
  it off and the document takes `default_visibility`. Using the key WITHOUT
  an `audiences:` block is refused on both surfaces — `pnpm build` stops with
  `ksor-visibility-without-audiences` and `pnpm serve` refuses to boot —
  because a document marked restricted while nothing enforces it is the one
  shape where the frontmatter is the only trace of a restriction that is not
  happening. Once `audiences:` is declared, `pnpm check`
  refuses any link or `superseded_by:` pointing from a wider audience at a
  narrower one — the leak no single build can catch, because the build that
  publishes the link has already dropped its target.

  **Publication, not authorship: anyone who can clone the repository reads
  every document regardless of frontmatter; if someone must not read a
  document and can clone, the answer is a second repository.**

- A replaced document is marked `status: superseded` with `superseded_by:`
  pointing at its successor — superseded documents are never deleted.
- Images and assets live in `knowledge/` beside the document that uses them,
  referenced by relative links. A relative link must never leave `knowledge/`.
- Copy load-bearing values (numbers, thresholds, dates) exactly from their
  source, and name the source in `provenance`.

### Structuring the record

- A folder per topic; its front page is `<folder>/index.md`, and the folder
  takes the position that page declares.
- Sidebar position is the governed `order:` key: documents that declare it come
  first, ascending; the rest follow in name order.
- One order drives the sidebar, `llms.txt`, and the home page's first-document
  link — set it once and every surface agrees.
- Never `meta.json` or `sidebar_position`: the checker refuses framework files
  in the record, which has to read the same without the site.

## Skills

- `.agents/skills/intake-interview/` — first run: interview the owner and
  write `instance.md` together.
- `.agents/skills/add-sources/` — turn source material (documents, pages,
  notes) into governed knowledge.
- `.agents/skills/format-checker/` — the rules above, as a program;
  `pnpm check` runs it and its errors explain how to fix themselves.

## Customizing the site

You own `system/site/` outright — these are the seams, cheapest first:

- **Display title** — `instance.md`'s body `# H1` (the intake interview
  writes it). Headline, navbar, and browser title follow on restart.
- **Accent color** — the one brand pair in `system/site/app/global.css`
  (`--color-fd-primary`, light and dark); every accented element follows.
- **Logo and favicon** — replace `system/site/app/icon.png`; the tab icon
  and the home-page mark are the same file.
- **Anything deeper** — edit the site like the Next.js app it is; the only
  rule that survives customization is critical rule 1. The whole shell is
  replaceable behind a five-clause contract (a themed Docusaurus shell with
  a swap recipe lives in the ksor repository under `workbench/shells/`).

## What this project owns

Everything. The scaffold was emitted by `ksor init` (version recorded in
`instance.md`) and belongs to this repository outright — change anything in
`system/` deliberately; the knowledge in `knowledge/` was always yours.
