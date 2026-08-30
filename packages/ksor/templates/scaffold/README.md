# KSOR-STAMP-NAME

A **Knowledge System of Record**: the governed source of knowledge this
project's people and AI agents operate from.

Three things live here, and they are not the same kind of thing:

- **`knowledge/` — the record.** Plain governed markdown (plus the optional
  study attachments a document may carry). Yours forever, readable anywhere,
  portable without this repository's code.
- **`system/` — the system.** The site, and later the services, that serve the
  record. Replaceable machinery.
- **`.ksor/governance.yaml` — the authority.** Which audiences exist, who may
  approve a document, who may take one down. Every governance act is checked
  against it, so the record never claims authority nobody granted.

The point of all this is the **agent interface**: an MCP door that answers from
the record with citations, and declines — in as many words — when the record
does not cover the question. That refusal is the feature; an agent that
improvises over a gap is the thing a system of record exists to prevent.
Beside it, the **human interface** is a site your readers browse. Same record,
same governance, different machinery: the site is files, the door is a process,
and they deploy separately.

**Contents**

- [Quick start](#quick-start)
- [Explore the human interface](#explore-the-human-interface)
- [Serving to agents](#serving-to-agents)
- [Quick deployment](#quick-deployment)
- [Make the record yours: replace the starters](#make-the-record-yours-replace-the-starters)
- [Writing knowledge](#writing-knowledge)
- [Deploying](#deploying)
- [Reference](#reference) — [commands](#commands) · [the files](#the-files-explained) · [when something refuses you](#when-something-refuses-you) · [dependencies](#dependencies-and-advisories)
- [Ownership](#ownership)

---

## Quick start

```sh
pnpm install
pnpm dev        # browse the knowledge at http://localhost:3000
```

<!-- ksor:pm pnpm -->

No pnpm? Run `npm install -g pnpm` — or `corepack enable pnpm` on Node
versions that bundle corepack.

<!-- /ksor:pm -->

**Commit the lockfile your first install writes.**

<!-- ksor:pm pnpm -->

The committed `pnpm-lock.yaml` covers the site but not `@panaversity/ksor`
itself: the version pinned in `package.json` was stamped by the CLI that
scaffolded this project and could not be resolved before that happened. Your
first `pnpm install` writes it in. Commit the result before you push — pnpm
turns on `--frozen-lockfile` automatically whenever `CI` is set, so an
uncommitted pin fails your CI rather than warning you. (`vercel.json` already
installs with `--no-frozen-lockfile`, and the shipped `validate.yml` runs no
install.)

<!-- /ksor:pm -->
<!-- ksor:pm npm -->

No lockfile ships with this scaffold: npm keeps ONE lock for the whole
workspace, and the `@panaversity/ksor` version pinned in `package.json` was
stamped by the CLI that scaffolded this project — it could not be resolved into
a lock before it existed. Your FIRST `npm install` writes `package-lock.json`;
run it before you push, and COMMIT the result — that lock is why two machines
build the same site.

One honest difference from the pnpm scaffold: pnpm quarantines newly published
dependency versions for 48 hours (`minimumReleaseAge`), so a routine install
never picks up a day-zero compromised release. npm has no equivalent — the
`.npmrc` here carries the install-script denial half of that posture, and this
sentence is the disclosure of the half it cannot.

<!-- /ksor:pm -->
<!-- ksor:pm bun -->

No lockfile ships with this scaffold: the `@panaversity/ksor` version pinned in
`package.json` was stamped by the CLI that scaffolded this project — it could
not be resolved into a lock before it existed. Your FIRST `bun install` writes
`bun.lock`; run it before you push, and COMMIT the result — that lock is why two
machines build the same site.

One honest difference from the pnpm scaffold: pnpm quarantines newly published
dependency versions for 48 hours (`minimumReleaseAge`), so a routine install
never picks up a day-zero compromised release. bun has no equivalent — its
default refusal of dependency install scripts covers the OTHER half of that
posture, and this sentence is the disclosure.

<!-- /ksor:pm -->

---

## Explore the human interface

Before changing anything, get a feel for how the record behaves. With
`pnpm dev` running:

- **Edit a starter document.** Change its body, save, watch the page update.
- **Add a new document.** It appears on the dev site, marked — and it would be
  on no built surface at all, because a new document is `status: draft`. No
  page, no sidebar row, no `/llms.txt` entry. That is the system working, not a
  broken build.
- **Ask your coding agent to do the same.** `AGENTS.md` carries the working
  rules; read it before you change how documents are written here. The kit in
  `.agents/skills/` already knows this project: `intake-interview` (define the
  record with you), `add-sources` (turn source material into governed
  documents), `make-slides`, `make-summary`, and `format-checker` (the rules,
  as a program — also what `pnpm check` runs).

**Treat the starters as scratch paper.** They ship approved by
`ksor-starter/KSOR-STAMP-VERSION` — a tool, not a person. Edit the body and that
approval stays stamped on text nobody reviewed, and `pnpm check` will not catch
it, because the frontmatter is still internally consistent. So explore in them
freely, but start nothing you intend to keep in one of them. Replacing them
properly is [below](#make-the-record-yours-replace-the-starters).

To see what a build actually produces:

```sh
pnpm build      # the static site, into system/site/out/
pnpm preview    # serve exactly those bytes
```

There is no `start` script, and that is not an omission: the site is a static
export, so nothing serves it at runtime. `pnpm preview` is `node:http` and
nothing else — no dependency, no network fetch — so it works offline and behind
a firewall, like the build itself.

It binds loopback, so it is reachable from this machine only. To open the built
site from a container published with `-p`, a cloud dev box, or a phone on the
same wifi, name the address on the command line — `preview` is plain `node` and
does not read `.env`:

```sh
KSOR_PREVIEW_HOST=0.0.0.0 pnpm preview
```

---

## Serving to agents

**This is the point of the whole thing.** The record's other surface is an MCP
server: the same knowledge, cited, with a measured floor under which it
declines. An agent connected to it answers from your governed documents or says
the record does not cover the question — and never quietly fills the gap from
its training.

It asks for two things `pnpm dev` does not: a Postgres store with pgvector, and
an embedding provider key. Three steps, and the order is load-bearing — the
command block is last because it needs both of the things above it.

### 1. Nothing to configure

`instance.md` already names the VARIABLE holding your DSN — never the DSN
itself:

```yaml
database:
  dsn_env: KSOR_DB_URL
```

That is the whole required config. `embedding:` defaults to Gemini at 1536
dimensions, and `retrieval:` is written for you by step 3's `calibrate`. Change
the variable name here only if you want a different one.

### 2. Fill in the environment

```sh
cp .env.example .env
```

Then set `KSOR_DB_URL`, `GEMINI_API_KEY` and `KSOR_AUTH=disabled-local`.

**Point `KSOR_DB_URL` at a hosted Postgres now if you intend to deploy** — the
same one your host will use. [Neon](https://neon.com) is what this project's own
docs are measured against; pgvector is on every plan including the free one, and
you enable it once per database with `CREATE EXTENSION IF NOT EXISTS vector;`.
Anything with pgvector works. [Quick deployment](#quick-deployment) explains why
one shared database saves you a step.

`ksor` reads `.env` automatically — there is nothing to export, and where a
refusal tells you to _export_ a variable, putting it in `.env` is the same
thing. `KSOR_AUTH=disabled-local` is required for a local run: serve refuses to
boot unauthenticated on purpose, so a server is never open by accident.

### 3. Bring it up

```sh
pnpm provision  # once: apply the schema, authorize ingest
pnpm refresh    # build, ingest the record, collect retired generations
pnpm exec ksor calibrate --instance instance.md   # measure the floor; paste the printed block into instance.md
pnpm serve      # the MCP server, with the gate already on
```

`pnpm provision` runs once — it applies the schema (or migrates it forward) and
authorizes ingest, the two privileged acts that should not happen on every boot.
After that, `pnpm refresh` publishes what you have edited and `pnpm serve` runs
the server. They are separate because **publishing is an act, not a side effect
of starting a process.**

**`calibrate` is what makes "not in this corpus" a real answer**, and it belongs
here rather than later: it needs an ingested corpus but no running server, and
the floor is read when the door boots — so measuring before `pnpm serve` means
the door comes up gated the first time. It prints a `retrieval:` block for THIS
corpus in THIS embedding space; paste it into `instance.md` exactly as printed.
Never copy a floor from another corpus.

It also prints its own caveat, and it is worth reading: the probes it writes are
derived from your passages, so they share vocabulary a real question will not.
The floor it reports is an upper bound on separation until you check it against
questions the corpus did not write (`--queries-file`).

A rerun on an unchanged record costs nothing: no new generation, no embedding,
no rows. Edit a document and the next run picks up exactly that change.

`AGENTS.md` → "Serving to agents" is the full runbook; your coding agent reads
it first. A public bind needs a configured SSO door rather than
`disabled-local` — see [The agent surface deploys
separately](#the-agent-surface-deploys-separately). Any other operation is
`pnpm exec ksor <verb>`.

### Test the door with an actual agent

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

**If you skipped `calibrate`, expect answers where this test wants refusals** —
the gate is off until a floor is measured, which the server says at boot
(`abstain OFF`) and in every search envelope (`gate: "off"`). That is honest,
not broken: a floor nobody measured would be a number pretending to be a
guarantee.

Open a new session of your coding agent, confirm it lists the server, then ask
it three questions **in this order** — the order is the test:

1. Something the record covers, **phrased in words the document never uses**.
   Retrieval is semantic, so this should still find it, and every answer should
   arrive with a citation.
2. Something **adjacent but not covered** — your record's own subject area, a
   question it genuinely does not answer. It should decline.
3. Something far outside the record. It should decline, and must not answer from
   its own knowledge.

Question 2 is the one that matters. Anything can answer questions it has the
text for; refusing a plausible near-miss is the property that makes a system of
record worth trusting, and it is the one that breaks quietly.

Delete `.mcp.json`, or keep it — it holds no secret.

---

## Quick deployment

Both surfaces on one domain, in about ten minutes:

1. **Push the repository to GitHub.**
2. **Import it in Vercel**, then **set Root Directory to `./`.** Vercel
   auto-fills it with `system/site`, because that is where it finds a framework
   — and the build then reads `system/site/vercel.json`, which does not exist,
   and fails with `Project framework is set to "services", but no services are
declared`. The services ARE declared, in `vercel.json` at the repo root,
   which is the only place they can be: one builds the site, the other builds a
   container from the root `Dockerfile`.
3. **Set three environment variables** in Vercel: `KSOR_DB_URL`,
   `GEMINI_API_KEY`, and `KSOR_AUTH=disabled-public`.

Two things catch people here, and both are the system being deliberate:

- **`disabled-local` will not deploy.** The container sets `$PORT`, so the door
  binds `0.0.0.0` — a PUBLIC bind — and refuses that value by design, saying so
  in as many words. `disabled-public` is you saying you know the door is
  reachable from outside itself. It belongs in Vercel's environment, not in your
  `.env`, so your local `pnpm serve` keeps its loopback posture. It is a
  starting posture, not a destination: [secure it
  properly](#audiences-decide-what-a-build-contains) with the SSO variables once
  the thing is up.
- **Point `KSOR_DB_URL` at a Postgres your host can reach.** Deploying does not
  publish — the door serves whatever generation is already in the database. If
  your DSN pointed at a database on your laptop, the site comes up fine and the
  door comes up empty. Use one hosted Postgres for both and the `pnpm refresh`
  you already ran is the generation Vercel serves.

If you only want readers served, the site is a static export with no database in
the loop: deploy with no environment variables at all and add the door later.

---

## Make the record yours: replace the starters

**Five starter documents publish on the first build.** They ship
`status: stable`, so `pnpm dev` and `pnpm build` both give you a working record
straight away — pages, a sidebar, a `/llms.txt` an agent can read — instead of
an empty shelf. They are approved by `ksor-starter/KSOR-STAMP-VERSION`: the tool
that wrote them, named as a producer rather than as a person, because no person
reviewed a word of it. That is what the trust tier _unverified_ on every one of
those pages says, and it is true.

They also describe KSoR, not your organisation — and a record that describes the
wrong thing describes it on every surface. So replace them, in this order:

1. **Run the intake interview.** Ask your coding agent for it. Three questions —
   what this record is the final word on, what sits just outside it, and who may
   approve or withdraw a document — then it writes `instance.md` with you and
   replaces the `human:you` placeholder in `.ksor/governance.yaml` with your
   real handle.
2. **Delete each starter document** as your own knowledge arrives.
3. **When the last one is gone, delete `ksor-starter/KSOR-STAMP-VERSION` from
   `approval_authorities` in `.ksor/governance.yaml`.** Nothing of yours should
   be approved by a tool.

---

## Writing knowledge

### A new document publishes nothing

A new document is `status: draft`, and `pnpm build` admits a draft to no surface
at all: no page, no sidebar row, no `/llms.txt` entry, nothing for an agent to
read. `pnpm dev` shows it, marked — the preview is where drafts live.

### Publishing adds two keys

Beside `status: stable`, name what produced the text and who approved it. Both,
or `pnpm check` refuses the document:

```yaml
status: stable
generated: { by: "human:you", at: 2026-01-31T09:00:00Z }
ksor:
  audience: [public] # already there — every document carries it, drafts too
  approval: { by: "human:you", at: 2026-01-31T09:00:00Z }
```

`generated` is **provenance**: it names whatever produced the text — a person,
or the agent that drafted it — and nothing has to authorise it.

`approval.by` is **authority**, so it must name an actor `.ksor/governance.yaml`
lists, and its `at` may not be earlier than `generated.at` — the text that was
approved has to be the text that was written. That act is yours.

Run `pnpm check` before you commit. It runs the rules as a program, and every
failure it reports says what is wrong, why the rule exists, and how to fix it.

### Presenting a document

Ask your coding agent for slides and it writes them, from the document, into the
record:

```
make slides for knowledge/expenses/approvals.md
```

The `make-slides` skill reads the document whole, writes the deck into
`knowledge/expenses/approvals.slides.yaml`, checks every claim and every number
back against the document, and tells you what it left out because the document
did not support it — which is usually how you find out a document has a gap. The
deck then renders on that document's page, straight after its introduction:
click through it inline, or **Present** for fullscreen. Presenter notes stay off
the screen.

The slides live in the record, so they are reviewed in the same pull request as
the document, versioned with it, and withdrawn when it is withdrawn. There is no
third party and no link to rot. If you already keep a deck in Google Slides,
Canva or SlideShare you can point at it instead — `slides.url:` rather than
`deck:` — and the page will offer it as a link with a frame the reader loads on
click, so nothing is requested from the host until somebody asks.

### Summarising a document

Long documents get a **Summary** tab beside their own words, written the same
way:

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
sidebar row, no line in `llms.txt`, and it takes its governance from its parent.
Ask for one only where there is something to compress — under about two screens,
a summary that restates the page teaches readers the tab is not worth opening,
and the skill will say so rather than write one.

---

## Deploying

[Quick deployment](#quick-deployment) covers the common path. This is the rest
of it.

### The site

`pnpm build` writes HTML, JS and CSS to `system/site/out/` — about 2 MB with
zero host-specific dependencies. Anything that can serve files can serve it, and
`pnpm preview` serves exactly those bytes locally.

**`pnpm build` runs `ksor build` first.** It generates every `index.md`, runs
the record checker, and writes `build.lock.json` — the committed record of what
was published, from which commit, with which toolchain — and only then builds
the site. A checker refusal stops the build before anything is written.

- **Vercel** — the shipped `vercel.json` deploys from the repo root, builds with
  `pnpm build`, and serves `system/site/out/`. It also declares the MCP **door**
  as a second service built from the shipped `Dockerfile`, so `/mcp` and the
  site share one domain.
  <!-- ksor:pm pnpm -->
  If the build image's pnpm predates the `packageManager` pin, set the
  `ENABLE_EXPERIMENTAL_COREPACK=1` build environment variable.
  <!-- /ksor:pm -->
- **GitHub Pages, nginx, S3, anything static** — run `pnpm build` and upload
  `system/site/out/`. Hosted under a sub-path (like `user.github.io/repo`)?
  Build with `KSOR_BASE_PATH=/repo pnpm build`.

**Verify any deploy** the same way: the home page, one document page and
`/llms.txt` load, and each names the documents this record has approved. On a
record whose documents are all still drafts, the home page and `/llms.txt` come
up empty and there is no document page at all — which is the correct answer, not
a broken deploy. Approve a document and rebuild to see it change.

### Takedowns reach the site through a committed file

Takedowns reach the site through `.ksor/takedowns.yaml`, the committed ledger —
a file in this repository, so the site build needs no database access at all.

That is deliberate. The act that withdraws a document is one merged commit, and
both surfaces read it: the door refuses immediately, the site at its next build.
Merge the ledger entry, rebuild, redeploy.

**A withdrawal that arrives on a clock works the same way, and that one has to
be scheduled.** `stale_after` and `ksor.effective_from` are evaluated once per
build, at the instant that build ran, and the answer is written into
`system/site/out/` — static files cannot re-decide themselves. So a document
whose `stale_after` passes after your last build keeps appearing in `/llms.txt`
and in its markdown twin, while `ksor serve` — a process, evaluating per request
— already refuses it. `ksor build` prints the next instant at which this
happens. Nothing here rebuilds for you: `validate.yml` runs on pull requests and
`vercel.json` declares no cron. **If this record uses either key, add a scheduled
rebuild and redeploy.**

### The agent surface deploys separately

`Dockerfile` and `.dockerignore` at the repo root build it, and they name no
host — the same image runs on Cloud Run, Fly, Render, ECS, Kubernetes or a VPS:

```sh
docker build -t my-record .
docker run --rm -p 8080:80 --env-file .env \
  -e KSOR_AUTH=disabled-public my-record
```

**That last flag is not boilerplate, and it is not a workaround.** The image
sets `$PORT`, so the door binds `0.0.0.0` — a PUBLIC bind — and the
`KSOR_AUTH=disabled-local` your `.env` carries refuses there by design. Your
laptop is not the exception: a container really is reachable from outside
itself, and `disabled-public` is you saying you know that. It goes on the
command rather than into `.env` so your ordinary `pnpm serve` keeps the loopback
posture — and a real deployment sets it (or, better, the SSO variables) in the
host's environment, since `.dockerignore` keeps `.env` out of the image
entirely.

One thing surprises people: **deploying does not publish.** The door serves
whatever generation is already in the database, so a first deploy with no
`pnpm refresh` serves an empty record. Publishing is a step you run — from your
machine or from CI — and it is deliberately not something a booting container
does. The full walkthrough, including what a cold start costs and where ingest
belongs, is in `node_modules/@panaversity/ksor/docs/deploying.md`.

### Audiences decide what a build contains

If `.ksor/governance.yaml` registers audiences, what you deploy is a **viewer**.
Plain `pnpm build` builds for `[public]` — safe for any host.
`KSOR_AUDIENCE=public,<audience> pnpm build` — a comma list that must always
include `public` — builds for a wider viewer, and that build carries an "— not
for publication" label because it must never reach a public host: put it behind
access control you already trust (VPN, SSO proxy, authenticated host). The tiers
govern what a build contains; where each build may be served is yours to
enforce.

The site can also show a **sign-in control** that names the reader in the
navbar. It is off until you set three variables (see `.env.example`), and it
names people rather than keeping them out — a static export cannot gate itself,
so it is worth having on a record already behind one of the answers above, and
is not a substitute for them. Setup and the honest limits:
`node_modules/@panaversity/ksor/docs/deploying.md`.

---

## Reference

### Commands

| Command                 | What it does                                                                                      | When                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| `pnpm install`          | fetches dependencies and the pinned `ksor` tool                                                   | first — then commit the lockfile |
| `pnpm dev`              | the site at `:3000`, drafts visible and marked                                                    | while you write                  |
| `pnpm check`            | runs the record checker as a program                                                              | before every commit              |
| `pnpm build`            | `ksor build` (index pages, checker, `build.lock.json`), then the static site to `system/site/out/` | before a deploy                  |
| `pnpm preview`          | serves `system/site/out/` — there is no `start`, the site is a static export                      | to check a build                 |
| `pnpm provision`        | applies the schema, authorizes ingest                                                             | once, for the agent surface      |
| `pnpm refresh`          | builds, ingests the record, collects retired generations                                          | every time you publish           |
| `pnpm serve`            | the MCP server on `:8080`                                                                         | to run the door locally          |
| `pnpm exec ksor <verb>` | everything else — `calibrate`, `takedown`, …                                                      | as needed                        |

### The files, explained

Nothing here is decoration, and the dotfiles are not ceremony — each one is a
different coding agent's way of finding the same working contract.

**The record and its authority**

| Entry                   | What it is                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/`            | **the record** — your governed markdown. The product; everything else serves it.                                                                                                                                                                                                                                                          |
| `instance.md`           | what this record is authoritative for; its `name:` is the identity every surface publishes and its `title:` the display title every page leads with (both read at server/build start — restart `pnpm dev` after changing either). Its BODY is the agent surface's system prompt — `ksor serve` wires it into the MCP server's instructions. |
| `.ksor/governance.yaml` | **the root of authority** — which audiences exist, who may approve a document, who may take one down. Committed; every governance act is checked against it.                                                                                                                                                                               |
| `.ksor/takedowns.yaml`  | the takedown ledger: every withdrawal and every lift, append-only and committed, so the site honours a takedown with no database in the loop. It appears at your first `ksor takedown` — an empty ledger would assert an act nobody performed.                                                                                              |
| `build.lock.json`       | what the last `ksor build` published — the corpus, the commit, the toolchain — and what every machine surface stamps. Committed; written by `ksor build`, never by hand.                                                                                                                                                                   |

**The system that serves it**

| Entry                         | What it is                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system/`                     | the code that serves the record: the site today, more as you need it.                                                                                                                                                                       |
| `package.json`                | the surface commands — `pnpm dev` (the site) and `pnpm provision` / `pnpm refresh` / `pnpm serve` (the agent surface) — plus `pnpm build` / `pnpm preview` / `pnpm check`, the pinned `@panaversity/ksor` tool and the workspace layout.      |
| `Dockerfile`, `.dockerignore` | how the agent surface reaches a host. The Dockerfile names no host; `vercel.json` points at it rather than replacing it, so moving hosts is a redeploy.                                                                                      |
| `vercel.json`                 | one domain, two services — the static site and the MCP door. Delete it if you deploy elsewhere.                                                                                                                                              |
| `.env.example`                | the variables the served rung needs; copy to `.env` (gitignored) and fill in.                                                                                                                                                               |

<!-- ksor:pm pnpm -->

| Entry                 | What it is                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` | where the workspace looks for code (`system/site`, plus reserved `system/gateways/*` and `system/packages/*`), and the supply-chain policy for installs. |
| `pnpm-lock.yaml`      | the exact dependency versions — the reason two machines build the same site.                                                                            |

<!-- /ksor:pm -->
<!-- ksor:pm npm -->

| Entry               | What it is                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.npmrc`            | dependency install scripts are denied; the comment inside discloses the one protection this scaffold lacks (a 48-hour quarantine on new releases). |
| `package-lock.json` | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site.                       |

<!-- /ksor:pm -->
<!-- ksor:pm bun -->

| Entry      | What it is                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bun.lock` | the exact dependency versions — written by your FIRST install; commit it, it is the reason two machines build the same site. |

<!-- /ksor:pm -->

**The working contract**

| Entry                            | What it is                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                      | the working contract every coding agent reads first — the rules for writing knowledge here.                                                                                                             |
| `CLAUDE.md`                      | one line, pointing at `AGENTS.md`. Claude Code looks for this filename, not that one.                                                                                                                   |
| `.agents/skills/`                | the agent kit: `intake-interview` (define the record with you), `add-sources` (turn source material into governed documents), `make-slides`, `make-summary`, `format-checker` (the rules, as a program). |
| `.claude/skills/`                | byte-identical copies of the kit — Claude Code discovers skills only here. The checker enforces the mirror, so the two cannot drift.                                                                     |
| `.gemini/settings.json`          | points Gemini CLI at `AGENTS.md`; Gemini does not read that filename on its own.                                                                                                                        |
| `.github/workflows/validate.yml` | your CI: runs the same checker on every pull request and push to main.                                                                                                                                  |
| `.gitattributes`                 | markdown is checked out byte-stable on every platform, so the same commit hashes the same everywhere.                                                                                                   |
| `.gitignore`                     | keeps build output, `node_modules/`, and `.env` out of the record's history — and negates two paths inside `.ksor/`, because the policy and the ledger ARE the record.                                   |

`format-checker` deliberately contains a program, `check.mjs`, and not only
prose: rules that are only written down cannot refuse anything.

Everything here is yours to change. The kit exists so that any coding agent can
operate this project without being taught it first.

### When something refuses you

This project refuses loudly and on purpose. Most of what looks like a failure is
a rule doing its job — and every refusal names its own fix, so this table is a
map rather than a substitute.

| What you see                                                         | What it means                                                                                              | What to do                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm check` refuses a document                                      | `status: stable` without both `generated` and `ksor.approval`, or an approval earlier than the text it approves | add both keys; approval cannot precede what it approves                                |
| `start` — missing script                                             | there is none: the site is a static export, so nothing serves it at runtime                                | `pnpm preview`, or upload the folder                                                   |
| `pnpm preview` exits `3`                                             | no `system/site/out/` yet, `PORT` is not a port number, the port is taken, or `KSOR_PREVIEW_HOST` cannot be bound — it says which | build first; or set a free `PORT` (`dev` uses 3000 too). `preview` binds loopback; set `KSOR_PREVIEW_HOST` to reach it from a container or another device |
| `pnpm serve` refuses to boot                                         | it will not run unauthenticated by accident                                                                | `KSOR_AUTH=disabled-local` in `.env` for a loopback run                                |
| the deployed or containerised door refuses with `disabled-local`     | it binds `0.0.0.0` — a public bind                                                                         | `KSOR_AUTH=disabled-public` in the host environment, or configure the SSO variables    |
| the agent answers questions 2 and 3 instead of declining             | no floor is measured, so the gate is off (`abstain OFF`, `gate: "off"`) — step 3's `calibrate` was skipped  | `pnpm exec ksor calibrate --instance instance.md`, paste the block, restart             |
| a deployed door serves an empty record                               | deploying does not publish — and a laptop DSN is unreachable from the host                                 | point both at one hosted Postgres, then `pnpm refresh`                                 |
| the home page and `/llms.txt` are empty                              | every document is still a draft — correct, not broken                                                      | approve one and rebuild                                                                |
| a new document never appears on the built site                       | drafts reach no built surface at all                                                                       | publish it — `status: stable` plus both governance keys                                |
| an expired document still shows on the site but not through the door | the static build evaluated `stale_after` at build time                                                     | rebuild and redeploy; schedule a rebuild if you use it                                 |
| Vercel: `no services are declared`                                   | Root Directory was auto-filled with `system/site`                                                          | set it to `./`                                                                         |

### Dependencies and advisories

An audit of this scaffold reports vulnerabilities in `next`, and will keep doing
so: a framework that large always has open advisories against whatever version
you have pinned.

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

**Never let an audit tool raise the pin for you.** It moves off the version this
scaffold was built and tested against, and that pin is the whole reason two
machines produce the same site. Bump it deliberately instead — take the newer
pin a newer `ksor init` emits, or raise it yourself and re-run `pnpm build`.

It also reads worse than it is, for one structural reason worth knowing: **this
site is a static export.** `pnpm build` writes HTML, JS and CSS to
`system/site/out/`, and no framework server ever runs in front of your readers —
no middleware, no server actions, no rewrites, no image optimizer. Most
framework advisories describe exactly those request paths, so they have nothing
here to reach.

Two things that argument does NOT cover, and you should treat as real: an
advisory in the **build** toolchain, which does run, on your machine and in your
CI; and any advisory at all if you later add a served route and stop exporting.
Read what an advisory affects before deciding it is inert — the static export is
a reason, not a blanket.

---

## Ownership

Everything here is yours. The scaffold was generated by
[ksor](https://github.com/panaversity/ksor) (version in `instance.md`) and is
granted without attribution or licence obligations; your knowledge was never
anyone else's to license.
