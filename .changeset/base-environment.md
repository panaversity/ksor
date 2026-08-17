---
"@panaversity/ksor": patch
---

Rebuilt the package on the real toolchain: the CLI is now compiled TypeScript
(pure ESM, Node >= 24) instead of a hand-written script, and it exports the CLI
contract — `exitCodes` (1 refused, 2 not implemented, 3 environment), `verbs`,
and `resolveCommand` — so scripts and agents can rely on documented exit
semantics. Behavior is unchanged: every designed verb still answers honestly
that it is not implemented and exits 2. Documentation now ships inside the
package under `docs/`.
