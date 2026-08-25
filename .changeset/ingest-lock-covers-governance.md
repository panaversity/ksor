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

**A migrated database is now the same database as a fresh one.** Nothing compared
the two; a schema-parity check across columns, constraints, indexes, policies,
privileges and triggers found the profile's two CHECK constraints carrying
different names on each side, and `schema.sql` now names them as the migration
does.

Also: an empty `sources:` list is the same value as no `sources:` list
everywhere, so it no longer changes a generation's provenance digest depending
on which side of a round trip it is read from.
