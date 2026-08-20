---
"@panaversity/ksor": patch
---

feat: standing up the agent surface is one command and one config block.
`ksor` now reads `./.env` automatically (Node-native, no dependency; a real
environment variable still wins), scaffolded projects get `pnpm up` —
schema → grant → ingest → serve — and `ksor schema --apply` is re-runnable
instead of failing on an already-provisioned database, so the whole sequence
is safe to repeat and doubles as the refresh after editing `knowledge/`.

fix: a scaffolded project deploys on the first try. The shipped `vercel.json`
pinned `--frozen-lockfile`, so an adopter's first Vercel import failed with
`ERR_PNPM_OUTDATED_LOCKFILE` — the scaffold declares a root dependency whose
stamped version the committed lockfile cannot record.

fix: the serve runbook no longer tells first-timers to declare
`retrieval.vector_floor: uncalibrated` before serving, which made every request
refuse until a floor was measured. Configuring the record needs one `database:`
block; the abstention gate is turned on deliberately, after it serves.
