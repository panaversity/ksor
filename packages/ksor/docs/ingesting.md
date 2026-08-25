---
title: Ingesting
status: draft
---

# Publishing the record — `ksor ingest`

Serving does not publish. That split is deliberate and it is the thing most
worth understanding before a first deployment: `ksor serve` opens a port against
whatever generation is already active, and `ksor ingest` is what makes a
generation exist. A container that ingested on boot would pay the whole record's
embedding cost on every cold start and would need write credentials at runtime.

So **a first deploy with no ingest serves an empty record.** It is not broken;
nothing was ever published to it.

## Before the first command

Ingest reads your markdown, sends each new chunk to an embedding provider, and
writes the result to Postgres. So four things must be true, and none of them is
created for you.

|                      | what                                                                                                                                                                              | how                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **The corpus**       | `knowledge/` at your repo root — CommonMark `.md`, one document per file, in the KSoR Profile of OKF: `type`, `title`, `description`, `status` and `ksor.audience` in frontmatter | `pnpm check` validates it and explains any violation; `ksor build` must have written a current `build.lock.json` before ingest will run |
| **The database**     | Postgres with **pgvector** — `CREATE EXTENSION vector;`                                                                                                                           | any managed host; the DDL below needs a role that can create tables                                                                     |
| **The provider key** | `GEMINI_API_KEY` — the default embedding provider is `gemini-embedding-001`                                                                                                       | [aistudio.google.com](https://aistudio.google.com/apikey); the free tier covers a first corpus                                          |
| **The DSN**          | `KSOR_DB_URL`, named by `instance.md`'s `database.dsn_env`                                                                                                                        | uncomment the `database:` block in `instance.md` first                                                                                  |

Both variables go in `.env` beside `instance.md` — `ksor` reads it automatically,
and `.env` is gitignored. Every command below is run **from your repository
root**, where `instance.md` and `package.json` live.

## The order, once

```sh
pnpm provision   # ksor schema --apply, then ksor grant
pnpm refresh     # ksor ingest --flip, then ksor gc
```

`provision` is separate because applying DDL and granting ingest are acts an
operator performs, not side effects of starting a server. Both are re-runnable
and report what they found — an applied schema says "already applied", an
existing grant says "already granted".

Then, after every change to `knowledge/`:

```sh
pnpm refresh   # publishes to the agent surface
pnpm build     # rebuilds the website from the same corpus
```

**Both surfaces, every time.** `refresh` publishes a generation the MCP door
serves immediately; the website is a static build and only changes when you
rebuild and redeploy it. Ingest alone leaves the human surface showing the old
content, which reads as a half-failed ingest and is not one.

## What a generation is

Each ingest builds a **fresh generation** — invisible until activated — and
carries every unchanged embedding forward from the last complete one, matched by
content hash. Only changed or previously-failed chunks are re-embedded.

`--flip` swaps the active pointer, and the previous generation stays as a
rollback target.

**`gc` will not take it.** It never collects the active generation, the rollback
generation, or any generation a live snapshot token could still pin, and it
always leaves at least two complete generations standing. That is why `pnpm
refresh` can safely run `ingest` and `gc` back to back — the routine command
does not eat the safety net it just created.

Three consequences worth knowing:

- **Re-ingest is cheap.** An ordinary edit makes a handful of provider calls,
  not a corpus-worth.
- **An unchanged record costs nothing at all.** Ingest compares what it just
  read against the generation already serving and, when they are identical at
  the same commit, consumes no generation and writes no rows:
  `unchanged — generation N already serves this corpus`.
- **Reordering is free.** Changing `order:` frontmatter re-ingests with no
  embedding at all; only the ordering moved.

A flip that would drop more than `KSOR_MAX_SHRINK` of the record (default
`0.15`, i.e. 15%) **refuses**. When a large deletion is intended, say so:
`KSOR_ALLOW_SHRINK=1`.

## Did it work?

The failure this page opens with — a healthy door serving an empty record — is
invisible unless you look. Three checks, cheapest first:

```sh
# 1. the door knows which corpus it serves, and its embedding space is intact
curl -s http://127.0.0.1:8080/health

# 2. something is actually published — ask for the record's structure
curl -s -X POST http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"outline","arguments":{}}}'
```

An empty `nodes` array means nothing was published — the ingest did not run, or
ran without `--flip`. Then search for a phrase you know is in the record and
check the hits carry `provenance.stable_id` and `generation`.

**`provenance.stable_id` is also how you name a document to `takedown`.** It is
`knowledge/<path-without-.md>` — always, since path is identity and nothing
overrides it — and a search result is still the reliable way to read one off
rather than typing it from memory.

## Where ingest runs — not on the host

Ingest is a long job. It embeds every new chunk through the provider, and that
is bounded by the provider's throughput rather than by anything ksor does.

**Measured 2026-08-23:** an 81-document book — 6,963 chunks — took **about 50
minutes** against a remote Postgres on a first, cold ingest with nothing to
carry forward. Not re-measured since.

Compare that with the request timeouts of the platforms people reach for first:
a serverless function caps out in the region of 300–800 seconds depending on
plan. Ingest is **an order of magnitude past that**, so it cannot be a route, a
build step, or anything else the platform is allowed to kill.

Run it where nothing is watching a clock:

- **From your machine**, with `KSOR_DB_URL` pointing at the deployment's
  database. This is the honest default for a record one person maintains.
- **From CI**, as a job triggered on changes to `knowledge/` — the right shape
  once more than one person edits, because it makes publishing an auditable
  event rather than something someone did locally.

It does not matter whether the process that ingests is the process that serves.
They meet in the database and nowhere else.

### If an ingest is interrupted

Nothing is corrupted — an unactivated generation is invisible by construction.
Run it again. The next attempt finds the incomplete generation's work and
carries forward everything that was already embedded, including from a
generation that was still `building` when it died, so a resumed run pays only
for what the first one had not reached.

## Endpoints and poolers

If your provider offers both a **pooled** and a **direct** endpoint (Neon's
`-pooler` host, or port 6432), use whichever it gives you. ksor detects which and
says so at boot, but the line is informational — it classifies, it never
transforms, and the hazard it descends from cannot arise here. The 6,963-chunk
ingest measured above (2026-08-23) ran through a pooled endpoint without
incident. Reach for
the direct endpoint only if you actually hit pooler connection limits.

## Turning the abstention gate on

This is a separate act, done once, **after** the record is serving — because it
is a measurement of this corpus in this embedding space, and there is nothing to
measure until the corpus is in there.

```sh
pnpm exec ksor calibrate --instance instance.md
```

It prints a recommended `vector_floor`. Paste it into **`instance.md`** with the
date you measured it, then restart `ksor serve` — the floor is read at boot:

```yaml
retrieval:
  vector_floor: 0.55 # measured by ksor calibrate on 2026-08-23
```

Until you do, `/health` reports the gate as `OFF (no floor declared — will not
refuse out-of-corpus questions)` and every search envelope carries
`gate: "off"`. That is honest absence, and an agent reading the envelope knows
an answer is not evidence of coverage.

**Never copy a floor from another corpus.** The number means nothing away from
the corpus and embedding space it was measured in.

If calibrate reports `NOT separable`, read what it names underneath: it lists
the out-of-corpus probes that scored at or above your weakest in-corpus
question. Usually one of them is a question your record actually answers, and it
belongs on the in-corpus side — moving it separates the measurement. Sometimes
it is a genuine near-miss the corpus cannot separate, and then the floor
correctly stays uncalibrated.

## Withdrawing a document

A takedown is a committed ledger entry FIRST and a database row second, written
in one act — so it reaches the door immediately and the site at its next build,
and a record with no database can still withdraw a document:

```sh
pnpm exec ksor takedown --instance instance.md <stable-id> \
  --reason "legal request 2026-08" --actor human:j.smith
```

`--actor` is required, and there is no default. A name taken from the
environment reads like a person and is whatever the shell happened to be
(`runner` under CI, `root` in a container) — worse than no name at all in the
one row that exists to record who did this.

Two things the actor must satisfy, both refused before any database is touched.
It must be a well-formed actor — `human:<handle>` or `process:<id>`, never a
bare name (`ksor-actor-form`) and never a `team:` (a team cannot perform an
act). And `takedown_authorities` in `.ksor/governance.yaml` must name it
(`ksor-takedown-unauthorised`); the same check runs over every entry in the
ledger at `pnpm check`, `ksor build` and ingest, so a line appended by hand in a
pull request is refused exactly as the verb would refuse it.

Lifting a takedown is `--revoke <entry-id>` — the id of the LEDGER ENTRY, not
the stable id. The denial that created it prints the id, `ksor takedown
--ledger` lists it, and it is written in `.ksor/takedowns.yaml`; none of the
three needs a database, because the ledger is a file in the repository. The ledger is append-only: a
revocation is a new entry, never a deleted line, and a build whose ledger shrank
against its own git history is refused.

**The site stops at its next build.** It reads the committed ledger
(`.ksor/takedowns.yaml`), so after a takedown, merge the entry, rebuild and
redeploy the site, or the human surface keeps publishing what the agent
surface already refuses. The site needs no database for this: the
ledger is a file in the repository, and the site build reads it.
