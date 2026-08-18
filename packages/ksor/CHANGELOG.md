# @panaversity/ksor

## 0.0.1

### Patch Changes

- 98aae4a: Rebuilt the package on the real toolchain: the CLI is now compiled TypeScript
  (pure ESM, Node >= 24) instead of a hand-written script, and it exports the CLI
  contract — `exitCodes` (1 refused, 2 not implemented, 3 environment), `verbs`,
  and `resolveCommand` — so scripts and agents can rely on documented exit
  semantics. `ksor --help`/`-h` and `--version` now answer with exit 0; every designed
  verb still answers honestly that it is not implemented and exits 2, and an
  unknown word is refused with exit 1 and a stable `error: unknown-verb` slug. Documentation now ships inside the
  package under `docs/`.

## 0.0.0

Name reservation (published 2026-08-11). The package holds the scope, states
the intent, and ships an honest placeholder CLI: any invocation prints the
reservation notice and exits `2`. Nothing in this version is a released
capability.
