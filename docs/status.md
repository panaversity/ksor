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
- **Governance machinery**: AGENTS.md constitution (CLAUDE.md symlinks to it)
  carrying the decision record, guard invariants with a shrink-only baseline
  (`pnpm guard`), corpus integrity checks (`pnpm check:corpus`),
  package-boundary tests at baseline zero, and two repo-maintenance skills
  under `.agents/skills/` (`implement-spec`, `find-skills`).
- **Fixture**: `workbench/example-corpus/` — a tiny governed corpus exercising
  the same rules adopters will live under.

## Designed, not implemented

- `ksor init` / `dev` / `build` / `serve` — the verbs themselves.
- The MCP agent surface and the human site surface.
- Build provenance records (`build.lock.json`) — designed with `ksor build`.
- The agent-eval harness (contract in AGENTS.md → Testing).
- Doc code-sample checking (`check-snippets`) — deferred until the docs carry
  import fences worth verifying.
- The `ksor init` scaffold (generated constitution, rules, corpus skills) —
  designed fresh when `init` lands; the predecessor's templates are one input,
  not the blueprint.

Primitives design for the verbs: `research/primitives-proposal.md`.

## Predecessor (vsor)

The Python-era SDK at
[panaversity/zia-vsor-sdk](https://github.com/panaversity/zia-vsor-sdk)
ships a working product (`vsor` 0.1.4 on PyPI, live demo at
vsor-demo.vercel.app). **It is reference material, not authority**: this repo
reads it for ideas and for its failure record
(`research/handover-vsor-to-ksor.md`) and decides independently — no code,
Python or TypeScript, is ported without an independent case — and its Python
packages additionally may not be ported at all while their copy grant remains
unwritten (the predecessor's own extraction rule).

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
