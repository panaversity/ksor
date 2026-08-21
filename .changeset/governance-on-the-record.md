---
"@panaversity/ksor": patch
---

Governance now lives on the record, and databases can move forward.

**`visibility:` is enforced on the MCP surface.** It used to be enforced only by
the site's build-time staging step, because ingest dropped the key and the agent
door had nothing to filter on — a document marked `visibility: internal` was
hidden from the website and served in full to every agent. Schema 2.2 carries
`visibility`, `doc_status`, `owner`, `provenance`, `superseded_by` and
`corpus_id` on `content_nodes`; one seam (`lib/audience.ts`) binds the filter
into search, read and outline. A server that cannot establish who is asking
serves the least-privileged tier; an unknown tier refuses rather than widening;
a record that declares no `audiences:` is unfiltered exactly as before.

**A takedown now reaches BOTH surfaces, and has a door.** `ksor takedown
<stable-id> --reason …` imposes one (`--subtree`, `--list`, `--revoke`), through
the ingest role rather than a superuser psql prompt, writing the §7 row that
records who did it in the same transaction as the denial. `--export` writes the
manifest the site build reads, so a withdrawn document stops being published on
the human surface — `llms.txt` included. Schema 2.3 adds the write policy this
needs, and a `sor_content_auditor` role: `retrieval_log` had FORCE row-level
security, an INSERT policy, and no SELECT policy or grant, so the provenance
ledger the governance story rests on was write-only under every credential ksor
ships.

**The calibrator no longer hands out a floor it just measured as leaking.** When
a measurement does not separate in-corpus from out-of-corpus, the report says so
and names the fail-closed state (`vector_floor: uncalibrated`) instead of
printing a paste-ready number — the intended operator is a coding agent, and it
will paste what it is given. Two reporting bugs replicated from the Python
predecessor are also fixed: a missing generation printed Python's `None` literal
into the provenance comment, and the alternate-floor line always claimed
0.95-precision whatever precision was actually measured. Byte-fidelity to the
oracle is for algorithms, never for reports. The paste line now carries the
measurement DATE, which the invariant asked for and it never had.

**Forward migrations.** `schema/migrations/<from>-<to>__<slug>.sql` with a runner
that walks the chain rather than sorting it, so a missing step refuses instead of
being skipped. `ksor schema --apply` now compares versions instead of checking
presence, and migrates an existing database forward — replacing "drop and
recreate", which destroyed `retrieval_log` and `takedown_denylist`, the only two
tables that cannot be rebuilt from markdown.

**A wake-from-suspend is retried instead of failing the request.**
`connectionTimeoutMillis` bounds two different failures and Postgres reports
both with the same text: waiting for a slot in a saturated pool, and failing to
establish a connection at all. ksor treated both as saturation, which is never
retried — so on a serverless endpoint the first request after an idle period,
the one most likely to hit a cold start, was the one request that got no
retries. Measured against a black-holed endpoint: one attempt, 10s, with five
retries and a 30s budget unused. The two are now told apart by the pool's own
state and only saturation sheds.

**A dropped connection no longer kills `ksor serve`.** pg-pool removes a
client's error listener for the duration of a checkout, so a connection dying
mid-query became an uncaught exception and exited the process — the failure mode
of every serverless endpoint that suspends its compute. Checkouts are now
guarded and broken connections are discarded rather than reused.

**Search is no longer O(corpus).** The vector arm ranked with a window function,
which no HNSW index scan can satisfy, so every search computed the distance for
every chunk and sorted. Measured on PostgreSQL 17.7 / pgvector 0.8.2 at 20k rows:
452 ms → 39 ms, with the index actually used.

**`ksor serve` refuses where `pnpm build` refuses.** Two states had the site
stopping by name while the agent door came up clean and served the restricted
half. A database migrated to 2.2 carries the governance columns but no VALUES —
a migration cannot read frontmatter — and a NULL visibility reads as
`default_visibility`, the widest tier, so an adopter who migrated without
re-ingesting served every restricted document to every agent with the schema
check green. Schema 2.4 stamps each generation with the schema it was built
against, and serve refuses a generation older than the governance columns,
naming `ksor ingest` as the fix. A document declaring `visibility:` in a record
with no `audiences:` block is refused too, matching the site's
`ksor-visibility-without-audiences`.

**A `--subtree` takedown now reaches documents added after it.** The exported
manifest could only name what the active generation contained, and the site
builds from disk — so a document written under a withdrawn section and not yet
ingested was published to `/docs` and `llms.txt` with no warning anywhere. The
manifest now carries the DIRECTORIES a subtree denial governs, derived from its
descendants' recorded file paths. The site also checks the manifest belongs to
this record: one exported for a different instance used to pass every gate and
apply the wrong denial set.

**The readiness probe answers, and means something.** `/ready` reports NOT ready
while the schema is unverified, instead of green on an instance where every tool
call would fail on a missing column; the boot check is retried like a serving
read rather than treated as permanently unknown after one cold start; the whole
readiness chain shares one wall-clock budget (measured: 10.25s → 8.07s against
an unreachable endpoint); and concurrent probes share one in-flight check
however slow it is, instead of stacking a connection each.

**A cold burst is no longer mistaken for an overloaded pool.** pg-pool counts a
socket that is still completing its handshake as a full slot, so a burst of
requests arriving at a waking database looked like saturation and was shed
permanently — with identical requests getting opposite verdicts depending on
arrival order. Saturation is now measured by connections that actually
connected.

Also: every envelope now reports the abstention `gate` and the measured
`top_cosine`, so `ok=true` from an uncalibrated record can no longer be read as
coverage; the MCP server states four framework rules in its instructions instead
of serving the unedited scaffold placeholder; `ingest` records the git commit it
ingested instead of the literal string `unspecified`; `pnpm setup` separates
applying DDL and granting ingest from starting a server, and `pnpm serve` now
collects retired generations; the scaffold ships the `database:` block its own
runbook requires, and `env.example` documents the production variables the code
actually reads; shutdown logs and has a deadline; pool sizing and the TLS posture
are chosen rather than inherited; `ksor takedown --export` reads through the
runtime role rather than the ingest role, so a site build host no longer needs
write access to the record; and `KSOR_DRAIN_TIMEOUT_MS` is read when the server
starts rather than when the module loads, which is what made it inert in `.env`.
