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

All three managers emit it: npm and bun REPLACE the manager-owned scripts
rather than extending the template's, so fixing the template alone left both of
them broken. Walked end to end under pnpm, npm and bun — install, provision,
refresh, serve, then a live MCP call returning cited hits.

Existing records need no change; running `refresh` simply also builds.
