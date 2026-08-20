---
"@panaversity/ksor": patch
---

fix: the scaffold's one-command script is `pnpm start`, not `pnpm up`. `up` is
pnpm's own alias for `update`, so the script shipped in 0.0.5 was shadowed by
the package manager: an adopter following the runbook ran `pnpm up` expecting
to bring their record up and instead upgraded their dependencies. Anyone on
0.0.5 should use `pnpm run schema && pnpm run grant && pnpm run ingest &&
pnpm run serve` until they re-scaffold.
