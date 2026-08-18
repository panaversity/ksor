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
versions that bundle corepack.

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
| `package.json`                   | the `pnpm dev` / `pnpm build` / `pnpm check` commands, and the pnpm version this project pins.                                                                                                                                   |
| `pnpm-workspace.yaml`            | where the workspace looks for code (`system/site`, plus reserved `system/gateways/*` and `system/packages/*`), and the supply-chain policy for installs.                                                                         |
| `pnpm-lock.yaml`                 | the exact dependency versions — the reason two machines build the same site.                                                                                                                                                     |

`format-checker` deliberately contains a program, `check.mjs`, and not only
prose: rules that are only written down cannot refuse anything. `pnpm check`
runs it, and every failure it reports says what is wrong, why the rule exists,
and how to fix it.

Everything here is yours to change. The kit exists so that any coding agent can
operate this project without being taught it first.

## Ownership

Everything here is yours. The scaffold was generated by
[ksor](https://github.com/panaversity/ksor) (version in `instance.md`) and is
granted without attribution or licence obligations; your knowledge was never
anyone else's to license.
