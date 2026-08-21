---
"@panaversity/ksor": patch
---

Correct every remaining document that said `pnpm serve` publishes.

`serve` was `pnpm schema && pnpm grant && pnpm ingest && ksor serve` and is now
`ksor serve` alone. Three adopter-facing places still described the old chain:
the scaffolded `instance.md`'s own comment ("copy .env.example to .env, then run
`pnpm serve`"), the scaffold README's file table ("the agent surface: schema →
grant → ingest → serve"), and AGENTS.md's runbook ("`pnpm serve` is the only
command this rung needs"). Following any of them serves an empty record.

All three now say the same thing the CLI does: `pnpm provision` once,
`pnpm refresh` to publish, `pnpm serve` to serve — and why publishing is
separate, since a restart or an autoscaling event must not republish a record.

A test now asserts the CLAIM rather than the command. The existing guard could
not catch this: it checks that a named command exists, and `pnpm serve` does
exist — what was wrong was the sentence attached to it.
