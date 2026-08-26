# KSOR-STAMP-NAME

A **Knowledge System of Record**: the governed source of knowledge this
project's people and AI agents operate from.

Two worlds live here:

- **`knowledge/` — the record.** Plain governed markdown (plus the optional
  study attachments a document may carry). Yours forever, readable anywhere,
  portable without this repository's code.
- **`system/` — the system.** The site (and later, services) that serve the
  record. Replaceable machinery.

**Contents** — [Working here](#working-here) · [Serving to agents](#serving-to-agents) · [The files](#the-files-explained) · [When something refuses you](#when-something-refuses-you) · [Deploying](#deploying) · [Ownership](#ownership)

## Working here

```sh
pnpm install
pnpm dev        # browse the knowledge at http://localhost:3000
pnpm build      # the static site, into system/site/out/
pnpm preview    # serve what you just built — there is no `start`, see below
```

<!-- ksor:pm pnpm -->

No pnpm? Run `npm install -g pnpm` — or `corepack enable pnpm` on Node
versions that bundle corepack.
<!-- /ksor:pm -->

The first `pnpm install` also fetches the
`ksor` tool (pinned in `package.json`) and writes it into your lockfile —
commit the updated lockfile.

**The five starter documents publish on the first build.** They ship
`status: stable`, so `pnpm dev` and `pnpm build` both give you a working
record straight away — pages, a sidebar, a `/llms.txt` an agent can read —
instead of an empty shelf. They are approved by `ksor-starter/KSOR-STAMP-VERSION`:
the tool that wrote them, named as a producer rather than as a person, because
no person reviewed a word of it. That is what the trust tier _unverified_ on
every one of those pages says, and it is true.

**So your first act here is replacing them.** They describe KSoR, not your
organisation, and a record that describes the wrong thing describes it on every
surface. Delete each one as your own knowledge arrives — and when the last is
gone, delete `ksor-starter/KSOR-STAMP-VERSION` from `approval_authorities` in
`.ksor/governance.yaml` too. Nothing of yours should be approved by a tool. Ask
your coding agent to run the intake interview: it replaces the `human:you`
placeholder in that file with your real handle and writes `instance.md` with
you.

**What you write starts unpublished.** A new document is `status: draft`, and
`pnpm build` admits a draft to no surface at all: no page, no sidebar row, no
`/llms.txt` entry, nothing for an agent to read. `pnpm dev` shows it, marked —
the preview is where drafts live.

Publishing one adds two keys beside `status: stable` — what produced the text,
and who approved it. Both, or `pnpm check` refuses the document:

```yaml
status: stable
generated: { by: "human:you", at: 2026-01-31T09:00:00Z }
ksor:
  audience: [public] # already there — every document carries it, drafts too
  approval: { by: "human:you", at: 2026-01-31T09:00:00Z }
```

`generated` is provenance: it names whatever produced the text — a person, or
the agent that drafted it — and nothing has to authorise it. `approval.by` is
authority, so it must name an actor `.ksor/governance.yaml` lists, and its `at`
may not be earlier than `generated.at` — the text that was approved has to be
the text that was written. That act is yours, so the record never claims
authority nobody granted.

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
part of `pnpm dev`. Three steps, and the order is load-bearing: the command
block is last because it needs both of the things above it. Skip ahead to it
and `pnpm provision` refuses, naming the config step 1 writes.

**1. Nothing to configure.** `instance.md` already names the VARIABLE holding
your DSN — never the DSN itself:

```yaml
database:
  dsn_env: KSOR_DB_URL
```

That is the whole required config. `embedding:` defaults to Gemini at 1536
dimensions, and leaving `retrieval:` out starts you with the abstention gate
off and honest about it — turn it on with `ksor calibrate` once the record is
serving. Change the variable name here only if you want a different one.

**2. Copy the environment file**, then fill in `KSOR_DB_URL`, `GEMINI_API_KEY`
and `KSOR_AUTH=disabled-local`:

```sh
cp .env.example .env
```

`ksor` reads `.env` automatically — there is nothing to export, and where a
refusal tells you to _export_ that variable, putting it in `.env` is the same
thing. `KSOR_AUTH=disabled-local` is required for a local run: serve refuses to
boot unauthenticated on purpose, so a server is never open by accident.

**3. Bring it up.**

```sh
pnpm provision  # once: apply the schema, authorize ingest
pnpm refresh    # build, ingest the record, collect retired generations
pnpm serve      # the MCP server
```

`pnpm provision` runs once — it applies the schema (or migrates it forward) and
authorizes ingest, the two privileged acts that should not happen on every
boot. After that: `pnpm refresh` publishes what you have edited, and `pnpm serve`
runs the server. They are separate because publishing is an act, not a side
effect of starting a process. A rerun on an unchanged record
costs nothing: no new generation, no embedding, no rows. Edit a document and
the next run picks up exactly that change. `AGENTS.md` → "Serving to agents" is the
full runbook; your coding agent reads it first. A public bind needs a
configured SSO door rather than `disabled-local` — see step 2 and
"The agent surface deploys separately" below. Any other operation is
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

### A note on `audit`

An audit of this scaffold reports vulnerabilities in `next`, and will keep
doing so: a framework that large always has open advisories against whatever
version you have pinned.
<!-- ksor:pm npm -->

`npm install` prints the count at the end of every install, so you meet it
before you have run anything, next to an invitation to run
`npm audit fix --force`.
<!-- /ksor:pm -->
<!-- ksor:pm pnpm -->

pnpm reports it only when you run `pnpm audit`.
<!-- /ksor:pm -->
<!-- ksor:pm bun -->

bun reports it only when you run `bun audit`.
<!-- /ksor:pm -->

**Never let an audit tool raise the pin for you.** It moves off the version
this scaffold was built and tested against, and that pin is the whole reason
two machines produce the same site. Bump it deliberately instead — take the
newer pin a newer `ksor init` emits, or raise it yourself and re-run
`pnpm build` and the deploy check above.

It also reads worse than it is, for one structural reason worth knowing:
**this site is a static export.** `pnpm build` writes HTML, JS and CSS to
`system/site/out/`, and no framework server ever runs in front of your
readers — no middleware, no server actions, no rewrites, no image optimizer.
Most framework advisories describe exactly those request paths, so they have
nothing here to reach. Two things that argument does NOT cover, and you should
treat as real: an advisory in the **build** toolchain, which does run, on your
machine and in your CI; and any advisory at all if you later add a served route
and stop exporting. Read what an advisory affects before deciding it is inert —
the static export is a reason, not a blanket.

## When something refuses you

This project refuses loudly and on purpose. Most of what looks like a failure
is a rule doing its job — and every refusal names the fix, so the table is a
map rather than a substitute.

| What you see                                                         | What it means                                                                                                   | What to do                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm check` refuses a document                                      | `status: stable` without both `generated` and `ksor.approval`, or an approval earlier than the text it approves | add both keys; approval cannot precede what it approves                   |
| `pnpm preview` exits `3`                                             | there is no `system/site/out/` yet                                                                              | run the build first                                                       |
| `start` — missing script | there is none: the site is a static export, so nothing serves it at runtime                                     | `pnpm preview`, or upload the folder                                      |
| `pnpm serve` refuses to boot                                         | it will not run unauthenticated by accident                                                                     | `KSOR_AUTH=disabled-local` in `.env` for a loopback run                   |
| a deployed or containerised door refuses `disabled-local`            | it binds `0.0.0.0` — a public bind                                                                              | set `KSOR_AUTH=disabled-public` in the host environment, or configure SSO |
| the agent answers a question it should decline                       | the abstention gate is off on a fresh record (`abstain OFF`, `gate: "off"`)                                     | `pnpm exec ksor calibrate --instance instance.md`                         |
| a deployed door serves an empty record                               | deploying does not publish — and a laptop DSN is unreachable from a host                                        | point both at one hosted Postgres, then `pnpm refresh`                    |
| the home page and `/llms.txt` are empty                              | every document is still a draft — correct, not broken                                                           | approve one and rebuild                                                   |
| a new document never appears on the built site                       | drafts reach no built surface at all                                                                            | publish it: `status: stable` plus both governance keys                    |
| an expired document still shows on the site but not through the door | the static build evaluated `stale_after` at build time                                                          | rebuild and redeploy; schedule a rebuild if you use it                    |
| Vercel: `no services are declared`                                   | Root Directory was auto-filled with `system/site`                                                               | set it to `./`                                                            |

## The files, explained

Nothing here is decoration, and the dotfiles are not ceremony — each one is a
different coding agent's way of finding the same working contract.

| Entry                            | What it is                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`                     | **the record** — your governed markdown. The product; everything else serves it.                                                                                                                                                                                                                                                            |
| `system/`                        | the code that serves the record: the site today, more as you need it.                                                                                                                                                                                                                                                                       |
| `instance.md`                    | what this record is authoritative for; its `name:` is the identity every surface publishes and its `title:` the display title every page leads with (both read at server/build start — restart `pnpm dev` after changing either). Its BODY is the agent surface's system prompt — `ksor serve` wires it into the MCP server's instructions. |
| `.ksor/governance.yaml`          | **the root of authority** — which audiences exist, who may approve a document, who may take one down. Committed; every governance act is checked against it.                                                                                                                                                                                |
| `.ksor/takedowns.yaml`           | the takedown ledger: every withdrawal and every lift, append-only and committed, so the site honours a takedown with no database in the loop. It appears at your first `ksor takedown` — an empty ledger would assert an act nobody performed.                                                                                              |
| `build.lock.json`                | what the last `ksor build` published — the corpus, the commit, the toolchain — and what every machine surface stamps. Committed; written by `ksor build`, never by hand.                                                                                                                                                                    |
| `Dockerfile`, `.dockerignore`    | how the agent surface reaches a host. The Dockerfile names no host; `vercel.json` points at it rather than replacing it, so moving hosts is a redeploy.                                                                                                                                                                                     |
| `vercel.json`                    | one domain, two services — the static site and the MCP door — for the host this scaffold answers the setup interview for. Delete it if you deploy elsewhere.                                                                                                                                                                                |
| `AGENTS.md`                      | the working contract every coding agent reads first — the rules for writing knowledge here.                                                                                                                                                                                                                                                 |
| `CLAUDE.md`                      | one line, pointing at `AGENTS.md`. Claude Code looks for this filename, not that one.                                                                                                                                                                                                                                                       |
| `.agents/skills/`                | the agent kit: `intake-interview` (define the record with you), `add-sources` (turn source material into governed documents), `make-slides` (generate a presentation from a document and attach it), `make-summary` (write a document's summary and attach it), `format-checker` (the rules, as a program).                                 |
| `.claude/skills/`                | byte-identical copies of the kit — Claude Code discovers skills only here. The checker enforces the mirror, so the two cannot drift.                                                                                                                                                                                                        |
| `.gemini/settings.json`          | points Gemini CLI at `AGENTS.md`; Gemini does not read that filename on its own.                                                                                                                                                                                                                                                            |
| `.github/workflows/validate.yml` | your CI: runs the same checker on every pull request and push to main.                                                                                                                                                                                                                                                                      |
| `.gitattributes`                 | markdown is checked out byte-stable on every platform, so the same commit hashes the same everywhere.                                                                                                                                                                                                                                       |
| `.env.example`                   | the variables the served rung needs; copy to `.env` (gitignored) and fill in.                                                                                                                                                                                                                                                               |
| `.gitignore`                     | keeps build output, `node_modules/`, and `.env` out of the record's history — and negates two paths inside `.ksor/`, because the policy and the ledger ARE the record.                                                                                                                                                                      |
| `package.json`                   | the surface commands — `pnpm dev` (the site) and `pnpm provision` / `pnpm refresh` / `pnpm serve` (the agent surface: set up once, publish, then serve) — plus `pnpm build` / `pnpm check`, the pinned `@panaversity/ksor` tool and the workspace layout the manifest declares.                                                             |

<!-- ksor:pm pnpm -->

| `pnpm-workspace.yaml` | where the workspace looks for code (`system/site`, plus reserved `system/gateways/*` and `system/packages/*`), and the supply-chain policy for installs. |
| `pnpm-lock.yaml` | the exact dependency versions — the reason two machines build the same site. |
<!-- /ksor:pm -->
<!-- ksor:pm npm -->

| `.npmrc` | dependency install scripts are denied; the comment inside discloses the one protection this scaffold lacks (a 48-hour quarantine on new releases). |
| `package-lock.json` | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site. |
<!-- /ksor:pm -->
<!-- ksor:pm bun -->

| `bun.lock` | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site. |
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

- **Vercel — push, import, and fix one field.**

  1. Push the repository to GitHub.
  2. Import it in Vercel.
  3. **Set Root Directory to `./`.** Vercel auto-fills it with `system/site`,
     because that is where it finds a framework — and then the build reads
     `system/site/vercel.json`, which does not exist, and fails with
     `Project framework is set to "services", but no services are declared`.
     The services ARE declared, in `vercel.json` at the repo root, which is
     the only place they can be: one builds the site, the other builds a
     container from the root `Dockerfile`.

  That is the whole setup — the shipped `vercel.json` answers the rest, and
  `/mcp` and the site end up on one domain. The door additionally needs
  `KSOR_DB_URL`, `GEMINI_API_KEY` and `KSOR_AUTH=disabled-public` in Vercel's
  environment; the site alone needs none of them.

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

**A withdrawal that arrives on a clock works the same way, and that one has to
be scheduled.** `stale_after` and `ksor.effective_from` are evaluated once per
build, at the instant that build ran, and the answer is written into
`system/site/out/` — static files cannot re-decide themselves. So a document
whose `stale_after` passes after your last build keeps appearing in `/llms.txt`
and in its markdown twin, while `ksor serve` — a process, evaluating per
request — already refuses it. `ksor build` prints the next instant at which
this happens. Nothing here rebuilds for you: `validate.yml` runs on pull
requests and `vercel.json` declares no cron. If this record uses either key,
add a scheduled rebuild and redeploy.

- **GitHub Pages, nginx, S3, anything static** — run `pnpm build` and
  upload `system/site/out/`. Hosted under a sub-path (like
  `user.github.io/repo`)? Build with `KSOR_BASE_PATH=/repo pnpm build`.
- **Verify any deploy** the same way: the home page, one document page and
  `/llms.txt` load, and each names the documents this record has approved. On a
  record whose documents are all still drafts, the home page and `/llms.txt`
  come up empty and there is no document page at all — which is the correct
  answer, not a broken deploy. Approve a document and rebuild to see it change.

### The agent surface deploys separately

The site is files; the MCP door is a process. `Dockerfile` and `.dockerignore`
at the repo root build it, and they name no host — the same image runs on
Cloud Run, Fly, Render, ECS, Kubernetes or a VPS:

```sh
docker build -t my-record .
docker run --rm -p 8080:80 --env-file .env \
  -e KSOR_AUTH=disabled-public my-record
```

**That last flag is not boilerplate, and it is not a workaround.** The image
sets `$PORT`, so the door binds `0.0.0.0` — a PUBLIC bind — and the
`KSOR_AUTH=disabled-local` your `.env` carries refuses there by design, saying
so in as many words. Your laptop is not the exception: a container really is
reachable from outside itself, and `disabled-public` is you saying you know
that. It goes on the command rather than into `.env` so your ordinary
`pnpm serve` keeps the loopback posture — and a real deployment sets it (or,
better, the SSO variables) in the host's environment, since `.dockerignore`
keeps `.env` out of the image entirely.

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
