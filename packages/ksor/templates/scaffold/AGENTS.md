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

1. **Configure `instance.md`.** Add the serve blocks to the frontmatter
   (`pnpm check` accepts them; the kernel validates their values):

   ```yaml
   database:
     dsn_env: KSOR_DB_URL # the NAME of the env var holding the DSN — never the DSN itself
   embedding:
     provider: gemini # default; the seam, not the vendor, is the contract
     model: gemini-embedding-001
     dim: 1536 # ≤ 2000 for the pgvector HNSW index
   retrieval:
     vector_floor: uncalibrated # see step 6; `uncalibrated` REFUSES every serve until you paste a number
   ```

2. **Provision Postgres** with the `vector` extension (`CREATE EXTENSION vector`),
   e.g. a Neon database. Export the DSN under the name `dsn_env` chose, plus the
   provider key:

   ```sh
   export KSOR_DB_URL='postgresql://…'   # the var instance.md names
   export GEMINI_API_KEY='…'             # the embedding provider key
   ```

3. **Apply the schema:** `pnpm schema` (creates tables, indexes, and the
   ingest role).

4. **Authorize ingest** — one row, once (row-level security refuses ingest
   without it; a future `ksor grant` verb will fold this in):

   ```sh
   psql "$KSOR_DB_URL" -c "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', '<name>')"
   ```

   `<name>` is `instance.md`'s `name:`. Apply the schema and ingest as the SAME
   Postgres login (the ingest role is granted to whoever applied the DDL).

5. **Ingest:** `pnpm ingest` — embeds `knowledge/` into a fresh generation and
   activates it (`--flip`). Safe to re-run (see the generation model below).

6. **Calibrate the abstention floor** (only if `vector_floor: uncalibrated`):
   `pnpm exec ksor calibrate --instance instance.md` prints a recommended
   `vector_floor` measurement; paste the number into `instance.md`'s `retrieval:`
   block and re-run. A corpus that declares no `retrieval:` block serves with the
   gate OFF (honest: it will not refuse out-of-corpus questions).

7. **Serve:** `pnpm serve`.

```sh
pnpm schema      # apply the DDL (once)
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

`pnpm serve` binds **loopback with auth off** — safe for local use. A **public**
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

## Publishing

`pnpm build` emits a fully static site (`system/site/out/`) deployable to
any host — Vercel reads the shipped `vercel.json` (deploy from the repo
ROOT, never `system/site/`), and every other host just serves the folder.
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
  it off and the document takes `default_visibility`. The key does nothing
  until `instance.md` declares `audiences:`; once it does, `pnpm check`
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
