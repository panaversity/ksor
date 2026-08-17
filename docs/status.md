# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-18.

## Published package

`@panaversity/ksor` **0.0.0** on npm — a name reservation, not a release. The
published artifact is a single placeholder script: any invocation prints the
reservation notice and exits `2`. It has no exports and bundles no docs.

## Implemented in this repository (unreleased — ships as 0.0.1)

- **Rebuilt CLI**: compiled TypeScript (pure ESM, Node ≥ 24); every designed
  verb (`init`, `dev`, `build`, `serve`) reports "designed but not
  implemented" and exits `2`; an unknown verb is refused with exit `1` and a
  stable `error: unknown-verb` stderr slug. The package root exports the CLI
  contract (`exitCodes`, `verbs`, `resolveCommand`), and docs ship inside the
  tarball under `docs/`. (Pending changeset: `.changeset/base-environment.md`.)

- **Base environment**: pnpm 11 workspace with catalog pins, TypeScript 7
  (native compiler), pure-ESM package build via tsdown, vitest unit +
  integration tiers, oxlint + oxfmt, minimal turbo, changesets with npm
  trusted publishing, CI with SHA-pinned actions.
- **Governance machinery**: AGENTS.md constitution (CLAUDE.md symlinks to it),
  `docs/decisions.md` settled-decision ledger, guard invariants with a
  shrink-only baseline (`pnpm guard`), corpus integrity checks
  (`pnpm check:corpus`), package-boundary tests at baseline zero, and five
  repo-maintenance skills under `.agents/skills/`.
- **Fixture**: `workbench/example-corpus/` — a tiny governed corpus exercising
  the same rules adopters will live under.

## Designed, not implemented

- `ksor init` / `dev` / `build` / `serve` — the verbs themselves.
- The MCP agent surface and the human site surface.
- `build.lock.json` provenance records (format 2 crosses from the
  predecessor when `ksor build` lands).
- The agent-eval harness (`evals/README.md` holds the contract).
- The `ksor init` scaffold: constitution, rules, and ~14 corpus skills cross
  from the predecessor's templates at implementation time.

Primitives design for the verbs: `research/primitives-proposal.md`.

## Predecessor (vsor)

The Python-era SDK at
[panaversity/zia-vsor-sdk](https://github.com/panaversity/zia-vsor-sdk)
ships a working product — `vsor` **0.1.4** on PyPI, CI green (330 unit + 28
boundary + 42 browser + 25 hosting checks), live demo at
vsor-demo.vercel.app. Its assets cross per
`research/handover-vsor-to-ksor.md`.

## Blocked

- **Python copy grant** — the predecessor's own rule
  (its `docs/extraction.md`): the Python packages
  (`sor-agentfactory/packages/*`) are **read and cite freely; do not move code
  until the grant is written**. The JS half was granted 2026-08-13. Until the
  Python grant exists in writing, no kernel file crosses.

## Pending owner actions

- Configure the **npm Trusted Publisher** for `@panaversity/ksor`
  (npm package settings → GitHub Actions) so `release.yml` can publish with
  provenance and no stored token.
- Repoint the **`vsor` PyPI Trusted Publisher** — it still names
  `panaversity/zia-vertical-system-of-record`, which no longer resolves; a
  release tag today passes every gate and fails at upload.
- Tell the **sor-agentfactory** maintainers the destination changed: five PRs
  making `sor-content` embedding-provider-agnostic now serve upstream hygiene,
  not the crossing — and PR 2's blast radius includes the nightly
  eval-before-flip gate.
