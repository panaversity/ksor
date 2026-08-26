---
"@panaversity/ksor": patch
---

Ingest now checks the whole lock, refuses an unaccountable takedown before it spends anything, and never serves a tier nobody asked for

**`ksor ingest` reads every digest `ksor build` records, not just the document
hashes.** The lock covers the instance, the governance policy, the takedown
ledger, the companions, the assets and the generated indexes — and ingest was
comparing only `documents[]`. So a governance file edited _after_ the build that
checked it went straight into a published generation: delete a denial's four
lines from `.ksor/takedowns.yaml`, ingest, and the MCP door published a document
the website still withdrew. Editing any of them without rebuilding now refuses
`ksor-lock-stale` and names the file. Re-run `ksor build`, commit both, ingest.

**A denial nothing in the repository accounts for now stops ingest where it
happens.** A record upgraded from schema 2.4 carries denylist rows with no
ledger entry, and `ksor serve` refuses to boot on exactly that. Ingest used to
say nothing, build and embed a whole generation, and only then refuse — leaving
an un-activated generation behind. It now refuses at the ledger step, before a
generation is allocated, with the same `ksor-takedown-unledgered` slug and the
remedy that resolves it (`ksor migrate --write`, commit, ingest).

**A read that names no audience is served nothing.** The kernel's read path bound
"the whole record" as its default viewer, which meant the SQL rule that denies an
unstated viewer could never fire. The default is gone: callers entitled to the
whole record say so, and everything else fails closed. An audience identifier
containing the list separator, or spelled `*`, is refused
(`ksor-audience-identifier-invalid`) rather than silently read as a different set
of audiences.

**A withdrawn-then-deleted document no longer bricks the record.** Deleting a
document after withdrawing it is the sequence the record spec sanctions, and
`ksor migrate --write` produces it on its own for any denial whose document is
already gone. The denylist row carried no record of that, so the boot check read
"no document with this id" as an orphaned denial and refused `ksor ingest` and
`ksor serve` permanently — while `ksor build` and the website stayed green. The
remedy it printed could not clear it: `ksor takedown --removed` records what
happened to the FILE and moves no row, so the only escape was to un-withdraw the
document. The row now carries `expected`, and a document the record itself
documents as removed is no longer read as an orphan. It stays withdrawn: the
serving predicate never reads that column.

**A migrated database is now the same database as a fresh one.** Nothing compared
the two; a schema-parity check across columns, constraints, indexes, policies,
privileges and triggers found the profile's two CHECK constraints carrying
different names on each side, and `schema.sql` now names them as the migration
does.

Also: an empty `sources:` list is the same value as no `sources:` list
everywhere, so it no longer changes a generation's provenance digest depending
on which side of a round trip it is read from.

**A malformed argument no longer reports itself as an outage.** A value Postgres
cannot represent — a NUL byte in a slug or a query is the reachable case — made
every read fail with "content store temporarily unavailable". The condition is
deterministic and harmless to the connection, but the tool guidance this door
hands every agent says `unavailable` means retry later and never conclude the
thing is absent, so a caller with one bad argument was told to retry forever
while the store answered everyone else. SQLSTATE class 22 is now reported as
what it is: the request was rejected as written, the store is healthy, and
retrying it unchanged will not help. Connection failures are unchanged.
