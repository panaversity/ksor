# KSOR-STAMP-NAME

A **Knowledge System of Record**: the governed source of knowledge this
project's people and AI agents operate from.

Two worlds live here:

- **`knowledge/` — the record.** Plain governed markdown. Yours forever,
  readable anywhere, portable without this repository's code.
- **`system/` — the system.** The site (and later, services) that serve the
  record. Replaceable machinery.

## Working here

```sh
pnpm install
pnpm dev        # browse the knowledge at http://localhost:3000
```

No pnpm? Run `npm install -g pnpm` — or `corepack enable pnpm` on Node
versions that bundle corepack. The first `pnpm install` also fetches the
`ksor` tool (pinned in `package.json`) and writes it into your lockfile —
commit the updated lockfile.

### Serving to agents

The record's other surface is an MCP server for AI agents — the same
knowledge, cited, with honest abstention. It is the climbed rung: it needs a
Postgres store (with pgvector) and an embedding provider key, so it is not
part of `pnpm dev`. The ordered path is:

```sh
cp .env.example .env    # fill in KSOR_DB_URL, GEMINI_API_KEY, KSOR_AUTH_DISABLED=1
pnpm provision         # once: apply the schema, authorize ingest
pnpm refresh           # ingest the record, collect retired generations
pnpm serve             # the MCP server
```

`ksor` reads `.env` automatically — nothing to export. `KSOR_AUTH_DISABLED=1`
is required for a local run: serve refuses to boot unauthenticated on purpose,
so a server is never open by accident.

Uncomment the `database:` block already in `instance.md` — it names the
VARIABLE holding your DSN, never the DSN itself. That is the whole required
config:
`embedding:` already defaults to Gemini at 1536 dimensions, and leaving
`retrieval:` out starts you with the abstention gate off and honest about it
(turn it on afterwards with `ksor calibrate`, once the record is serving).

`pnpm provision` runs once — it applies the schema (or migrates it forward) and
authorizes ingest, the two privileged acts that should not happen on every
boot. After that: `pnpm refresh` publishes what you have edited, and `pnpm serve`
runs the server. They are separate because publishing is an act, not a side
effect of starting a process. A rerun on an unchanged record
costs nothing: no new generation, no embedding, no rows. Edit a document and
the next run picks up exactly that change. `AGENTS.md` → "Serving to agents" is the
full runbook; your coding agent reads it first. `pnpm serve` refuses to boot
unauthenticated: a local run declares `KSOR_AUTH_DISABLED=1` (already in
`.env.example`) and binds loopback, so a server is never left open by accident;
a public bind needs a configured SSO door instead. Any other operation is
`pnpm exec ksor <verb>`.

Then talk to your coding agent — `AGENTS.md` carries the working rules, and
the agent kit in `.agents/skills/` knows how to interview you
(`intake-interview`), convert your source material (`add-sources`), and keep
the record well-formed (`format-checker`, also `pnpm check`).

### A note on the lockfile

The committed `pnpm-lock.yaml` covers the site. It cannot cover
`@panaversity/ksor` itself, because the version pinned in `package.json` is
stamped by the CLI that scaffolded this project and could not be resolved before
that happened. So your FIRST `pnpm install` writes it — run it before you push,
and commit the result.

The deploy config already accounts for this (`vercel.json` installs with
`--no-frozen-lockfile`), and the shipped `validate.yml` runs no install. If you
add CI of your own, note that pnpm turns on `--frozen-lockfile` automatically
whenever `CI` is set.

## The files, explained

Nothing here is decoration, and the dotfiles are not ceremony — each one is a
different coding agent's way of finding the same working contract.

| Entry                            | What it is                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`                     | **the record** — your governed markdown. The product; everything else serves it.                                                                                                                                                 |
| `system/`                        | the code that serves the record: the site today, more as you need it.                                                                                                                                                            |
| `instance.md`                    | what this record is authoritative for; its `name:` is the identity every surface publishes (read at server/build start — restart `pnpm dev` after renaming). This prose IS the agent surface's system prompt — `ksor serve` wires it into the MCP server's instructions. |
| `AGENTS.md`                      | the working contract every coding agent reads first — the rules for writing knowledge here.                                                                                                                                      |
| `CLAUDE.md`                      | one line, pointing at `AGENTS.md`. Claude Code looks for this filename, not that one.                                                                                                                                            |
| `.agents/skills/`                | the agent kit: `intake-interview` (define the record with you), `add-sources` (turn source material into governed documents), `format-checker` (the rules, as a program).                                                        |
| `.claude/skills/`                | byte-identical copies of the kit — Claude Code discovers skills only here. The checker enforces the mirror, so the two cannot drift.                                                                                             |
| `.gemini/settings.json`          | points Gemini CLI at `AGENTS.md`; Gemini does not read that filename on its own.                                                                                                                                                 |
| `.github/workflows/validate.yml` | your CI: runs the same checker on every pull request and push to main.                                                                                                                                                           |
| `.gitattributes`                 | markdown is checked out byte-stable on every platform, so the same commit hashes the same everywhere.                                                                                                                            |
| `.env.example`                   | the variables the served rung needs; copy to `.env` (gitignored) and fill in. |
| `.gitignore`                     | keeps build output, `node_modules/`, and `.env` out of the record's history.                                                                                                                                                    |
| `package.json`                   | the surface commands — `pnpm dev` (the site) and `pnpm provision` / `pnpm refresh` / `pnpm serve` (the agent surface: set up once, publish, then serve) — plus `pnpm build` / `pnpm check`, the pinned `@panaversity/ksor` tool, and the pnpm version this project pins.                                                |
| `pnpm-workspace.yaml`            | where the workspace looks for code (`system/site`, plus reserved `system/gateways/*` and `system/packages/*`), and the supply-chain policy for installs.                                                                         |
| `pnpm-lock.yaml`                 | the exact dependency versions — the reason two machines build the same site.                                                                                                                                                     |

`format-checker` deliberately contains a program, `check.mjs`, and not only
prose: rules that are only written down cannot refuse anything. `pnpm check`
runs it, and every failure it reports says what is wrong, why the rule exists,
and how to fix it.

Everything here is yours to change. The kit exists so that any coding agent can
operate this project without being taught it first.

## Deploying

The built site is a folder of files — 2 MB of HTML, JS and CSS with zero
host-specific dependencies. `pnpm build` writes it to `system/site/out/`,
and anything that can serve files can serve it.

- **Vercel** — connect the repository (or run `vercel`); the shipped
  `vercel.json` answers the setup interview: deploy from the repo root
  (never pin `system/site` as the root directory — the record lives
  outside it), build with `pnpm build`, serve `system/site/out/`. If the
  build image's pnpm predates the `packageManager` pin, set the
  `ENABLE_EXPERIMENTAL_COREPACK=1` build environment variable.
**Once `instance.md` declares a `database:`, the BUILD needs the DSN too.**
`pnpm build` first runs `pnpm export-denylist`, which asks the record's
database what has been withdrawn (`ksor takedown --export`) and writes
`.ksor-denylist.json` for the site to read. Without it the build stops:

```
KSOR_DB_URL is unset, and instance.md declares a database
  why: a takedown lives in that database. Without it this build cannot tell
  'nothing is denied' from 'nobody asked'
```

That is deliberate — a site built without asking would publish a document you
withdrew. Give the build environment the same `KSOR_DB_URL` your server uses
(read access is enough), or keep the record database-free, where the export
writes "nothing denied" and exits 0.

- **GitHub Pages, nginx, S3, anything static** — run `pnpm build` and
  upload `system/site/out/`. Hosted under a sub-path (like
  `user.github.io/repo`)? Build with `KSOR_BASE_PATH=/repo pnpm build`.
- **Verify any deploy** the same way: the home page, one document page,
  and `/llms.txt` all load; nothing else is required.

If `instance.md` declares `audiences:`, what you deploy is a **tier**.
Plain `pnpm build` always builds the public tier — safe for any host.
`KSOR_AUDIENCE=<audience> pnpm build` builds a wider tier for that
audience's own deployment, and that build carries an
"— not for publication" label because it must never reach a public host:
put it behind access control you already trust (VPN, SSO proxy,
authenticated host). The tiers govern what a build contains; where each
build may be served is yours to enforce.

## Ownership

Everything here is yours. The scaffold was generated by
[ksor](https://github.com/panaversity/ksor) (version in `instance.md`) and is
granted without attribution or licence obligations; your knowledge was never
anyone else's to license.
