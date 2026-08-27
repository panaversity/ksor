---
"@panaversity/ksor": patch
---

**`ksor schema --apply` no longer fails when two run at once.**

`schema.sql` creates three roles, and Postgres roles are CLUSTER-GLOBAL — so
`IF NOT EXISTS ... THEN CREATE ROLE` is check-then-act across every database on
the instance. Two concurrent applies both see the role absent and both create
it. Measured on Postgres 17.7 against an empty cluster: **six concurrent applies,
five failed.**

The SQLSTATE that surfaces is `unique_violation` (23505) on
`pg_authid_rolname_index`, **not** `duplicate_object` (42710) — catching only the
latter is the obvious fix and does not work. Both are caught now.

And each role is created in its **own** `DO` block. A `DO` block is a single
statement, so an exception anywhere in it rolls the whole block back: three
roles in one block meant a loser on the first never created the other two, and
the apply then granted against roles that did not exist.

This is not only a test-tier problem, which is why it lives in the DDL: two
operators provisioning at once, or a deploy step racing a developer, hit it
identically.
