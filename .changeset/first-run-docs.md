---
"@panaversity/ksor": patch
---

fix: a scaffolded project can be deployed and served on the first try. The
shipped `vercel.json` pinned `--frozen-lockfile`, so an adopter's first Vercel
import failed with `ERR_PNPM_OUTDATED_LOCKFILE` — the scaffold now declares a
root dependency whose stamped version the committed lockfile cannot record.
The serve runbook also told first-timers to write
`retrieval.vector_floor: uncalibrated` before ever serving, which makes every
request refuse until a floor is measured; configuring the record now needs one
`database:` block, and turning the abstention gate on is a deliberate step
after the record is actually serving.
