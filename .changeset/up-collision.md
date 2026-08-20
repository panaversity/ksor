---
"@panaversity/ksor": patch
---

fix: a scaffolded project has exactly two commands, one per surface —
`pnpm dev` for the site people read, `pnpm serve` for the record agents query
(it applies the schema, authorizes ingest, ingests, and serves). Neither asks
the reader to decide anything.

fix: the one-command script is no longer called `up`. `up` is
pnpm's own alias for `update`, so the script shipped in 0.0.5 was shadowed by
the package manager: an adopter following the runbook ran `pnpm up` expecting
to bring their record up and instead upgraded their dependencies. Anyone on
0.0.5 should use `pnpm run schema && pnpm run grant && pnpm run ingest &&
pnpm run serve` until they re-scaffold.
