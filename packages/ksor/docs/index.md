---
title: ksor documentation
status: draft
---

# ksor documentation

These docs ship inside the npm package (`node_modules/@panaversity/ksor/docs/`)
so that coding agents read documentation matching the **installed** version
instead of their training memory. That mechanism is live from 0.x on, even
though the docs are still small — the corpus grows with each implemented verb.

## What exists in this build

- The `ksor` CLI answers honestly: every designed verb (`init`, `dev`, `build`,
  `serve`) reports "designed but not implemented" and exits `2`.
- The package root exports the CLI contract: `exitCodes` (1 refused,
  2 not implemented, 3 environment), `verbs`, and `resolveCommand`.

## Where truth lives

- [`docs/status.md`](https://github.com/panaversity/ksor/blob/main/docs/status.md)
  in the repository is authoritative for implemented functionality.
- The repository [`README`](https://github.com/panaversity/ksor#readme) is the
  concept document, not a capability claim.
