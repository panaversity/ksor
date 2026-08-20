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
export KSOR_DB_URL='postgresql://…'   # the DSN var your instance.md names
export GEMINI_API_KEY='…'             # the embedding provider key
pnpm schema     # apply the database schema (once)
pnpm ingest     # embed knowledge/ into a generation and activate it
pnpm serve      # run the MCP server over the record
```

There are two setup steps before this — adding the `database:`/`embedding:`
blocks to `instance.md`, and authorizing ingest — plus the generation model
and the fail-closed security posture. `AGENTS.md` → "Serving to agents" is the
full runbook; your coding agent reads it first. `pnpm serve` binds loopback
with auth off for local use; a public bind fails closed unless auth is
configured. Any other operation is `pnpm exec ksor <verb>`.

Then talk to your coding agent — `AGENTS.md` carries the working rules, and
the agent kit in `.agents/skills/` knows how to interview you
(`intake-interview`), convert your source material (`add-sources`), and keep
the record well-formed (`format-checker`, also `pnpm check`).

## The files, explained

Nothing here is decoration, and the dotfiles are not ceremony — each one is a
different coding agent's way of finding the same working contract.

| Entry                            | What it is                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`                     | **the record** — your governed markdown. The product; everything else serves it.                                                                                                                                                 |
| `system/`                        | the code that serves the record: the site today, more as you need it.                                                                                                                                                            |
| `instance.md`                    | what this record is authoritative for; its `name:` is the identity every surface publishes (read at server/build start — restart `pnpm dev` after renaming). When the agent surface ships, this prose becomes its system prompt. |
| `AGENTS.md`                      | the working contract every coding agent reads first — the rules for writing knowledge here.                                                                                                                                      |
| `CLAUDE.md`                      | one line, pointing at `AGENTS.md`. Claude Code looks for this filename, not that one.                                                                                                                                            |
| `.agents/skills/`                | the agent kit: `intake-interview` (define the record with you), `add-sources` (turn source material into governed documents), `format-checker` (the rules, as a program).                                                        |
| `.claude/skills/`                | byte-identical copies of the kit — Claude Code discovers skills only here. The checker enforces the mirror, so the two cannot drift.                                                                                             |
| `.gemini/settings.json`          | points Gemini CLI at `AGENTS.md`; Gemini does not read that filename on its own.                                                                                                                                                 |
| `.github/workflows/validate.yml` | your CI: runs the same checker on every pull request and push to main.                                                                                                                                                           |
| `.gitattributes`                 | markdown is checked out byte-stable on every platform, so the same commit hashes the same everywhere.                                                                                                                            |
| `.gitignore`                     | keeps build output, `node_modules/`, and `.env*` out of the record's history.                                                                                                                                                    |
| `package.json`                   | the `pnpm dev` / `pnpm build` / `pnpm check` / `pnpm serve` / `pnpm ingest` commands, the pinned `@panaversity/ksor` tool, and the pnpm version this project pins.                                                                |
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
