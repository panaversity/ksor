---
"@panaversity/ksor": patch
---

**`pnpm refresh` now builds before it ingests.** The emitted README gives one
ordered path to the agent surface — `pnpm provision`, `pnpm refresh`,
`pnpm serve` — and on a brand new record the second step failed:
`ingest` publishes only a tree `ksor build` has checked, and refused
`ksor-lock-missing` on a recipe that never mentions `ksor build`.

The refusal named the fix, so nobody was stranded — but the documented path did
not work, which is the thing a first run is for. `refresh` is
`ksor build && pnpm ingest && pnpm gc` now: publishing stays a deliberate act,
separate from serving, and the check that makes it publishable is part of it.

Existing records need no change; running `pnpm refresh` simply also builds.
