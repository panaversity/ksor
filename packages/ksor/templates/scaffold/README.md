# KSOR-STAMP-NAME

A **Knowledge System of Record**: the governed source of knowledge this
project's people and AI agents operate from.

Two worlds live here:

- **`knowledge/` — the record.** Plain governed markdown (plus the optional
  study attachments a document may carry). Yours forever, readable anywhere,
  portable without this repository's code.
- **`system/` — the system.** The site (and later, services) that serve the
  record. Replaceable machinery.

## Working here

```sh
pnpm install
pnpm dev        # browse the knowledge at http://localhost:3000
```

<!-- ksor:pm pnpm -->
No pnpm? Run `npm install -g pnpm` — or `corepack enable pnpm` on Node
versions that bundle corepack.
<!-- /ksor:pm -->
The first `pnpm install` also fetches the
`ksor` tool (pinned in `package.json`) and writes it into your lockfile —
commit the updated lockfile.

### Presenting a document

Ask your coding agent for slides and it writes them, from the document, into
the record:

```
make slides for knowledge/expenses/approvals.md
```

The `make-slides` skill reads the document whole, writes the deck into
`knowledge/expenses/approvals.slides.yaml`, checks every claim and every
number back against the document, and tells you what it left out because the
document did not support it — which is usually how you find out a document has
a gap. The deck then renders on that document's page, straight after its
introduction: click through it inline, or **Present** for fullscreen.
Presenter notes stay off the screen.

The slides live in the record, so they are reviewed in the same pull request
as the document, versioned with it, and withdrawn when it is withdrawn. There
is no third party and no link to rot. If you already keep a deck in Google
Slides, Canva or SlideShare you can point at it instead — `slides.url:` rather
than `deck:` — and the page will offer it as a link with a frame the reader
loads on click, so nothing is requested from the host until somebody asks.

### Summarising a document

Long documents get a **Summary** tab beside their own words, and your agent
writes it the same way:

```
summarise knowledge/expenses/approvals.md
```

The `make-summary` skill reads the document whole, writes
`knowledge/expenses/approvals.summary.md`, and checks every line back against
the document — every number, every rule, and every `##` section, because a
summary that covers the opening and trails off is worse than none: a reader who
used it believes they have the whole document. It reports what it left out
because the document did not support it.

The summary is part of its document, not a document of its own: no route, no
sidebar row, no line in `llms.txt`, and it takes its governance from its
parent. Ask for one only where there is something to compress — under about two
screens, a summary that restates the page teaches readers the tab is not worth
opening, and the skill will say so rather than write one.

### Serving to agents

The record's other surface is an MCP server for AI agents — the same
knowledge, cited, with honest abstention. It is the climbed rung: it needs a
Postgres store (with pgvector) and an embedding provider key, so it is not
part of `pnpm dev`. The ordered path is:

```sh
cp .env.example .env    # fill in KSOR_DB_URL, GEMINI_API_KEY, KSOR_AUTH=disabled-local
pnpm provision         # once: apply the schema, authorize ingest
pnpm refresh           # ingest the record, collect retired generations
pnpm serve             # the MCP server
```

`ksor` reads `.env` automatically — nothing to export. `KSOR_AUTH=disabled-local`
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
unauthenticated: a local run declares `KSOR_AUTH=disabled-local` (already in
`.env.example`) and binds loopback, so a server is never left open by accident;
a public bind needs a configured SSO door instead. Any other operation is
`pnpm exec ksor <verb>`.

### Test the agent surface with an actual agent

The MCP door is meant to be read by agents, so check it with one rather than
with `curl`. With `pnpm serve` running, write `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "test-record": {
      "type": "http",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

Open a new session of your coding agent, confirm it lists the server, then ask
it three questions **in this order** — the order is the test:

1. Something the record covers, **phrased in words the document never uses**.
   Retrieval is semantic, so this should still find it, and every answer should
   arrive with a citation.
2. Something **adjacent but not covered** — your record's own subject area, a
   question it genuinely does not answer. It should decline.
3. Something far outside the record. It should decline, and must not answer
   from its own knowledge.

Question 2 is the one that matters. Anything can answer questions it has the
text for; refusing a plausible near-miss is the property that makes a system of
record worth trusting, and it is the one that breaks quietly.

**On a fresh record, 2 and 3 will not refuse — and that is honest, not broken.**
The abstention gate is off until you measure a floor for this corpus, which the
server says out loud at boot (`abstain OFF`) and in every search envelope
(`gate: "off"`). Run `pnpm exec ksor calibrate --instance instance.md` first if
you want to test refusal. Delete `.mcp.json`, or keep it — it holds no secret.

Then talk to your coding agent — `AGENTS.md` carries the working rules, and
the agent kit in `.agents/skills/` knows how to interview you
(`intake-interview`), convert your source material (`add-sources`), and keep
the record well-formed (`format-checker`, also `pnpm check`).

### A note on the lockfile

<!-- ksor:pm pnpm -->
The committed `pnpm-lock.yaml` covers the site. It cannot cover
`@panaversity/ksor` itself, because the version pinned in `package.json` is
stamped by the CLI that scaffolded this project and could not be resolved before
that happened. So your FIRST `pnpm install` writes it — run it before you push,
and commit the result.

The deploy config already accounts for this (`vercel.json` installs with
`--no-frozen-lockfile`), and the shipped `validate.yml` runs no install. If you
add CI of your own, note that pnpm turns on `--frozen-lockfile` automatically
whenever `CI` is set.
<!-- /ksor:pm -->
<!-- ksor:pm npm -->
No lockfile ships with this scaffold: npm keeps ONE lock for the whole
workspace, and the `@panaversity/ksor` version pinned in `package.json` was
stamped by the CLI that scaffolded this project — it could not be resolved
into a lock before it existed. Your FIRST `npm install` writes
`package-lock.json`; run it before you push, and COMMIT the result — that
lock is why two machines build the same site.

One honest difference from the pnpm scaffold: pnpm quarantines newly
published dependency versions for 48 hours (`minimumReleaseAge`), so a
routine install never picks up a day-zero compromised release. npm has no
equivalent — `.npmrc` here carries the install-script denial half of that
posture, and this sentence is the disclosure of the half it cannot.
<!-- /ksor:pm -->
<!-- ksor:pm bun -->
No lockfile ships with this scaffold: the `@panaversity/ksor` version pinned
in `package.json` was stamped by the CLI that scaffolded this project — it
could not be resolved into a lock before it existed. Your FIRST
`bun install` writes `bun.lock`; run it before you push, and COMMIT the
result — that lock is why two machines build the same site.

One honest difference from the pnpm scaffold: pnpm quarantines newly
published dependency versions for 48 hours (`minimumReleaseAge`), so a
routine install never picks up a day-zero compromised release. bun has no
equivalent (its default refusal of dependency install scripts covers the
OTHER half of that posture), and this sentence is the disclosure.
<!-- /ksor:pm -->

## The files, explained

Nothing here is decoration, and the dotfiles are not ceremony — each one is a
different coding agent's way of finding the same working contract.

| Entry                            | What it is                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`                     | **the record** — your governed markdown. The product; everything else serves it.                                                                                                                                                 |
| `system/`                        | the code that serves the record: the site today, more as you need it.                                                                                                                                                            |
| `instance.md`                    | what this record is authoritative for; its `name:` is the identity every surface publishes and its `title:` the display title every page leads with (both read at server/build start — restart `pnpm dev` after changing either). Its BODY is the agent surface's system prompt — `ksor serve` wires it into the MCP server's instructions. |
| `.ksor/governance.yaml`          | **the root of authority** — which audiences exist, who may approve a document, who may take one down. Committed; every governance act is checked against it. |
| `.ksor/takedowns.yaml`           | the takedown ledger: every withdrawal and every lift, append-only and committed, so the site honours a takedown with no database in the loop. |
| `build.lock.json`                | what the last `ksor build` published — the corpus, the commit, the toolchain — and what every machine surface stamps. Committed; written by `ksor build`, never by hand. |
| `Dockerfile`, `.dockerignore`    | how the agent surface reaches a host. The Dockerfile names no host; `vercel.json` points at it rather than replacing it, so moving hosts is a redeploy. |
| `vercel.json`                    | one domain, two services — the static site and the MCP door — for the host this scaffold answers the setup interview for. Delete it if you deploy elsewhere. |
| `AGENTS.md`                      | the working contract every coding agent reads first — the rules for writing knowledge here.                                                                                                                                      |
| `CLAUDE.md`                      | one line, pointing at `AGENTS.md`. Claude Code looks for this filename, not that one.                                                                                                                                            |
| `.agents/skills/`                | the agent kit: `intake-interview` (define the record with you), `add-sources` (turn source material into governed documents), `make-slides` (generate a presentation from a document and attach it), `make-summary` (write a document's summary and attach it), `format-checker` (the rules, as a program).                                                        |
| `.claude/skills/`                | byte-identical copies of the kit — Claude Code discovers skills only here. The checker enforces the mirror, so the two cannot drift.                                                                                             |
| `.gemini/settings.json`          | points Gemini CLI at `AGENTS.md`; Gemini does not read that filename on its own.                                                                                                                                                 |
| `.github/workflows/validate.yml` | your CI: runs the same checker on every pull request and push to main.                                                                                                                                                           |
| `.gitattributes`                 | markdown is checked out byte-stable on every platform, so the same commit hashes the same everywhere.                                                                                                                            |
| `.env.example`                   | the variables the served rung needs; copy to `.env` (gitignored) and fill in. |
| `.gitignore`                     | keeps build output, `node_modules/`, and `.env` out of the record's history — and negates two paths inside `.ksor/`, because the policy and the ledger ARE the record.                                                          |
| `package.json`                   | the surface commands — `pnpm dev` (the site) and `pnpm provision` / `pnpm refresh` / `pnpm serve` (the agent surface: set up once, publish, then serve) — plus `pnpm build` / `pnpm check`, the pinned `@panaversity/ksor` tool and the workspace layout the manifest declares.                                                |
<!-- ksor:pm pnpm -->
| `pnpm-workspace.yaml`            | where the workspace looks for code (`system/site`, plus reserved `system/gateways/*` and `system/packages/*`), and the supply-chain policy for installs.                                                                         |
| `pnpm-lock.yaml`                 | the exact dependency versions — the reason two machines build the same site.                                                                                                                                                     |
<!-- /ksor:pm -->
<!-- ksor:pm npm -->
| `.npmrc`                         | dependency install scripts are denied; the comment inside discloses the one protection this scaffold lacks (a 48-hour quarantine on new releases). |
| `package-lock.json`              | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site. |
<!-- /ksor:pm -->
<!-- ksor:pm bun -->
| `bun.lock`                       | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site. |
<!-- /ksor:pm -->

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
  outside it), build with `pnpm build`, serve `system/site/out/`. It also
  declares the MCP **door** as a second service built from the shipped
  `Dockerfile`, so `/mcp` and the site share one domain.
<!-- ksor:pm pnpm -->
  If the build image's pnpm predates the `packageManager` pin, set the
  `ENABLE_EXPERIMENTAL_COREPACK=1` build environment variable.
<!-- /ksor:pm -->
**`pnpm build` runs `ksor build` first.** It generates every `index.md`,
runs the record checker, and writes `build.lock.json` — the committed record
of what was published, from which commit, with which toolchain — and only
then builds the site. A checker refusal stops the build before anything is
written. Takedowns reach the site through `.ksor/takedowns.yaml`, the
committed ledger — a file in this repository, so the site build needs no
database access at all.

That is deliberate. The act that withdraws a document is one merged commit,
and both surfaces read it: the door refuses immediately, the site at its next
build. Merge the ledger entry, rebuild, redeploy.

- **GitHub Pages, nginx, S3, anything static** — run `pnpm build` and
  upload `system/site/out/`. Hosted under a sub-path (like
  `user.github.io/repo`)? Build with `KSOR_BASE_PATH=/repo pnpm build`.
- **Verify any deploy** the same way: the home page, one document page,
  and `/llms.txt` all load; nothing else is required.

### The agent surface deploys separately

The site is files; the MCP door is a process. `Dockerfile` and `.dockerignore`
at the repo root build it, and they name no host — the same image runs on
Cloud Run, Fly, Render, ECS, Kubernetes or a VPS:

```sh
docker build -t my-record .
docker run --rm -p 8080:80 --env-file .env my-record
```

One thing surprises people: **deploying does not publish.** The door serves
whatever generation is already in the database, so a first deploy with no
`pnpm refresh` serves an empty record. Publishing is a step you run — from your
machine or from CI — and it is deliberately not something a booting container
does. The full walkthrough, including what a cold start costs and where ingest
belongs, is in `node_modules/@panaversity/ksor/docs/deploying.md`.

If `.ksor/governance.yaml` registers audiences, what you deploy is a
**viewer**. Plain `pnpm build` builds for `[public]` — safe for any host.
`KSOR_AUDIENCE=public,<audience> pnpm build` — a comma list that must always
include `public` — builds for a wider viewer's own deployment, and that build
carries an
"— not for publication" label because it must never reach a public host:
put it behind access control you already trust (VPN, SSO proxy,
authenticated host). The tiers govern what a build contains; where each
build may be served is yours to enforce.

The site can also show a **sign-in control** that names the reader in the
navbar. It is off until you set three variables (see `.env.example`), and it
names people rather than keeping them out — a static export cannot gate itself,
so it is worth having on a record already behind one of the answers above, and
is not a substitute for them. Setup and the honest limits:
`node_modules/@panaversity/ksor/docs/deploying.md`.

## Ownership

Everything here is yours. The scaffold was generated by
[ksor](https://github.com/panaversity/ksor) (version in `instance.md`) and is
granted without attribution or licence obligations; your knowledge was never
anyone else's to license.
