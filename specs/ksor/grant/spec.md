---
status: ratified
date: 2026-08-20
claim: agents are the operator, not the audience for a manual — finishing setup must not require dropping out of ksor into psql, and who may write a corpus must stay an explicit, auditable act
evidence: packages/content/schema/schema.sql §roles · packages/content/src/db.ts (INGEST_ROLE, runIngest) · security re-verification 2026-08-20
---

# ksor grant — authorizing ingest

Row-level security refuses every write to a tenant's corpus until a row in
`ingest_tenant_grants` authorizes it. That row **is** the authorization: a CLI
flag is not, and a caller cannot vote itself write access. This verb performs
that act through the tool, so the golden path never leaves ksor.

## Why it is not folded into `schema --apply`

`schema --apply` knows the tenant, so folding the insert in would be a few
lines — and would be wrong. Applying DDL and authorizing writes are different
acts, routinely by different people with different database privileges. A
schema step that silently granted itself write access would make the tool its
own authorizer, which is the inversion the grant table exists to prevent
(critical rule 1: never weaken a governance guarantee to simplify an
implementation). Keeping it a separate, named act is the point, not overhead.

## Observable contract

**Invocation.** `ksor grant --instance PATH` authorizes ingest for the tenant
the instance names; `ksor grant --instance PATH --revoke` withdraws it. The
role is **not** a flag: it is the schema's pinned `sor_content_ingest`
(`INGEST_ROLE`), printed in the output so the acting operator sees what they
granted. A grant primitive that cannot revoke is incomplete, so both
directions ship together.

**The database is reached the way every other verb reaches it** — through
`pg`, using the DSN in the environment variable `instance.md` names
(`database.dsn_env`). No `psql`, no second tool, no connection string on the
command line.

**Idempotent, and says which it did.** Granting an existing grant is success,
reported as already authorized (not a duplicate-key error); revoking an absent
grant is success, reported as not authorized. Re-running is always safe — the
verb reports the state it established, never merely "ok".

**Refusals are the CLI contract.** Exit `1` when the instance is missing or
unreadable, or when the corpus schema has not been applied yet (remedy: run
`ksor schema --instance PATH --apply` first — an unapplied schema has no grant
table, and "relation does not exist" is not an answer). Exit `3` when the DSN
variable is unset or the database is unreachable. Exit `0` on success.

**What exists afterwards is the proof.** The row names the role and the
tenant; `--revoke` removes exactly that row. Nothing is implied, defaulted, or
inferred from the absence of a flag.

## Acceptance

1. Against a live schema: `grant` makes a previously refused `ingest` succeed;
   `--revoke` makes it refused again. The round trip is the test — not the row
   count, but the write the row authorizes.
2. Idempotence in both directions, each reporting the state it found.
3. An unapplied schema exits `1` naming `ksor schema --apply`; an unset DSN
   exits `3` naming the variable `instance.md` chose.
4. No `psql` appears in any adopter-facing path for the golden setup.

## Out of scope

Granting roles other than the ingest role (the runtime role is granted by the
schema itself); cross-tenant or bulk grants (one act, one tenant — a bulk
grant is a governance smell); anything that would let a non-operator escalate
by re-running a build step.
