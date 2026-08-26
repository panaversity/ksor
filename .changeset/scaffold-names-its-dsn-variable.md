---
"@panaversity/ksor": patch
---

**A new record already names its DSN variable.** `instance.md`'s
`database.dsn_env` shipped commented out, so climbing to the served rung began
with an edit whose only purpose was to delete two `#` characters — and the
instruction to do it was repeated in four places, one of which (`.env.example`)
sat right beside a `KSOR_DB_URL=` line that was NOT commented. A first-time
reader had to notice that one file names the variable and another defines it,
and that only one of the two needed uncommenting.

It is filled in now. Naming an environment variable costs nothing and requires
no database: `pnpm dev` and `pnpm build` never read it, and the value only has
to exist when you run `provision`, `refresh` or `serve`. Verified on a real
scaffold from the published package with the block live and `KSOR_DB_URL`
unset — `check`, `ksor build` and a full static site build all succeed, and the
record publishes.

So the served rung is now: set `KSOR_DB_URL` in `.env`, then `provision`,
`refresh`, `serve`. The step that was pure ceremony is gone, and `ksor init`'s
own next-steps, the scaffold's `AGENTS.md`, `.env.example` and
`docs/ingesting.md` all say the same thing.
