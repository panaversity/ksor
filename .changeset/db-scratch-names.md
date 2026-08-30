---
"@panaversity/ksor": patch
---

Test infrastructure only — nothing an adopter installs behaves differently.

Every database-tier suite now bootstraps its scratch database under a name
unique to the run (`ksor_<slug>_<base36 ms>_<6 hex>`) instead of a fixed one.
Fixed names meant two runs against one Postgres — a second `pnpm test:db`, a CI
matrix job, an agent running the tier alongside a person — dropped each other's
database `WITH (FORCE)` mid-test, which surfaced as a missing table or a short
row count and read as flakiness. A new reaper (`scripts/db-reaper.ts`, the
tier's globalSetup) drops what an interrupted run leaks, and guard rule 12 keeps
the naming from drifting back.
