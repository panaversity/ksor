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
pnpm refresh
```

## What a generation is

Each ingest builds a **fresh generation** — invisible until activated — and
carries every unchanged embedding forward from the last complete one, matched by
content hash. Only changed or previously-failed chunks are re-embedded.

`--flip` swaps the active pointer. The previous generation stays as a rollback
target; `ksor gc` reaps the ones nothing points at any more.

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

## Where ingest runs — not on the host

Ingest is a long job. It embeds every new chunk through the provider, and that
is bounded by the provider's throughput rather than by anything ksor does.

**Measured:** an 81-document book — 6,963 chunks — took **about 50 minutes**
against a remote Postgres on a first, cold ingest with nothing to carry forward.

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

## Endpoints, poolers, and what actually matters

If your provider offers both a **pooled** and a **direct** endpoint (Neon's
`-pooler` host, or anything on port 6432), ksor detects which one you gave it
and says so in the boot report. That line is **informational**: it classifies,
it never transforms. The hazard it descends from — a transaction pooler and
server-side prepared statements — cannot arise here, because node-postgres does
not auto-prepare.

For the record: the 6,963-chunk ingest above ran through a **pooled** endpoint
without incident, and the same DSN serves. Use whichever your provider gives
you, and reach for the direct endpoint only if you actually hit pooler
connection limits under a parallel ingest — not pre-emptively.

`KSOR_DB_POOLED_ENDPOINT=1` forces the classification when your host name does
not announce itself.

## Turning the abstention gate on

This is a separate act, done once, **after** the record is serving — because it
is a measurement of this corpus in this embedding space, and there is nothing to
measure until the corpus is in there.

```sh
pnpm exec ksor calibrate --instance instance.md
```

It prints a recommended `vector_floor`. Paste it in with the date you measured
it, and restart:

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

A takedown is a row, not a file, so it reaches the door immediately:

```sh
pnpm exec ksor takedown --instance instance.md <stable-id> \
  --reason "legal request 2026-08" --actor "j.smith"
```

`--actor` is required, and there is no default. A name taken from the
environment reads like a person and is whatever the shell happened to be
(`runner` under CI, `root` in a container) — worse than no name at all in the
one row that exists to record who did this.

**The site stops at its next build.** It reads `.ksor-denylist.json`, which
`pnpm build` refreshes via `pnpm export-denylist`. So after a takedown, rebuild
and redeploy the site, or the human surface keeps publishing what the agent
surface already refuses. See [deploying.md](./deploying.md) for why that build
needs `KSOR_DB_URL`.
