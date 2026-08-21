---
"@panaversity/ksor": patch
---

A governance act names its actor; the tool no longer guesses one.

`ksor takedown --actor` fell back to `$USER` / `$USERNAME` / `"operator"`, so a
ledger row read `runner` under CI and `root` in a container — a self-asserted
string wearing a schema, indistinguishable from a person who was never there.
`retrieval_log.actor` is `NOT NULL` with the comment "NO default: unset errors
loudly", and the fallback is precisely what stopped it erroring.

Denying or revoking now REFUSES without `--actor`, before the DSN is resolved:
a missing actor is an argument error (exit 1), not an environment one. The
read-only modes — `--list`, `--ledger`, `--export` — write no ledger row and
need nothing.
