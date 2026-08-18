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
  integration tiers, oxlint + oxfmt, changesets with npm
  trusted publishing, CI with SHA-pinned actions.
- **Governance machinery**: AGENTS.md constitution (CLAUDE.md symlinks to it)
  carrying the decision record, guard invariants (`pnpm guard`), corpus integrity checks (`pnpm check:corpus`),
  package-boundary tests at baseline zero, and two repo-maintenance skills
  under `.agents/skills/` (`implement-spec`, plus vendored `find-skills`,
  `skill-creator`, `mcp-builder` — hash-pinned in `skills-lock.json`).
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
  lands with `init`; the predecessor's templates convert under the decision-6
  grant, adapted deliberately rather than copied blindly.

Primitives design for the verbs: `research/primitives-proposal.md`.

## Predecessor (vsor)

The Python-era SDK at
[panaversity/zia-vsor-sdk](https://github.com/panaversity/zia-vsor-sdk)
ships a working product (`vsor` 0.1.4 on PyPI, live demo at
vsor-demo.vercel.app). **It is a source to mine, not an authority to
follow**: the owner granted taking its work — Python included — and
converting it to TypeScript (AGENTS.md decision 6, 2026-08-18, retiring the
handover's copy-grant blocker). Conversion is engineering-gated: nothing
crosses without asking what it was for, and converted code lands with its own
tests. Its failure record lives in `research/handover-vsor-to-ksor.md`.

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
