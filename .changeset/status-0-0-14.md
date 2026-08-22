---
"@panaversity/ksor": patch
---

Internal: a pool test that raced Postgres, and a comment that had it backwards

No adopter-visible behaviour changes.

`idle.db.test.ts` sampled `pg_stat_activity` immediately after a previous test's
`pool.end()`. Those are two different clocks — `end()` resolves when the client
socket closes, while the row disappears only once the server-side backend
actually exits — so the suite was order-coupled through the database and went
red in CI on a branch that changed nothing but a document. Each test now waits
for a quiet database before it starts, and states that it does.

The comment added in the previous release explaining the `env.example` guard fix
described the rename backwards: the TEMPLATE holds `env.example` and
`materialize.ts` maps it to `.env.example` on emit, not the other way round.
