# Implementation status

**This document is the only authority on what is implemented.** The README is
the concept; the released package version and this page are the facts. Last
updated: 2026-08-18.

## Published package

`@panaversity/ksor` **0.0.1** on npm (trusted publishing, provenance
attached). It ships the rebuilt CLI shell: every designed verb (`init`,
`dev`, `build`, `serve`) reports "designed but not implemented" and exits
`2`; an unknown verb is refused with exit `1` and a stable
`error: unknown-verb` stderr slug. The package root exports the CLI
contract (`exitCodes`, `verbs`, `resolveCommand`), and docs ship inside
the tarball under `docs/`.

## Implemented in this repository (unreleased — ships as 0.1.0)

- **`ksor init`** — the first working verb, implemented red-first against
  the ratified spec (`specs/ksor/init/spec.md`). One command emits a
  complete governed project: the record (`knowledge/`), the Fumadocs
  reference site (`system/site/`, static export, hot reload, static
  search, llms.txt), the agent kit (`AGENTS.md`, `CLAUDE.md` pointer,
  `.agents/skills` + byte-identical `.claude/skills` copies, `.gemini`
  pointer), adopter CI (`validate.yml`, SHA-pinned), and a dependency-free
  format checker (`pnpm check`). Deterministic (every emitted byte ships
  as template content, lockfile included), atomic, offline, refusals with
  stable slugs and remedies. Acceptance runs on ubuntu and windows; a
  gated browser e2e drives the built site in real Chromium.

- **The shell swap seam, proven with two implementations** — a Docusaurus
  conformance shell at `workbench/shells/docusaurus/` (predecessor-based,
  decision 6) swaps into any scaffolded project by its README recipe, and
  one shell-agnostic suite runs the surface contract's four clauses, the
  `order:` translation, and the base-path build against both shells in CI.
  `ksor init` still emits Fumadocs, always — the second shell is the
  option and the vendor-neutrality proof, not a selector.

- **Base environment**: pnpm 11 workspace with catalog pins, TypeScript 7
  (native compiler), pure-ESM package build via tsdown, vitest unit +
  integration tiers, oxlint + oxfmt, changesets with npm
  trusted publishing, CI with SHA-pinned actions.
- **Governance machinery**: AGENTS.md constitution (CLAUDE.md symlinks to it)
  carrying the decision record, guard invariants (`pnpm guard`), corpus integrity checks (`pnpm check:corpus`),
  package-boundary tests at baseline zero, and five repo-maintenance skills
  under `.agents/skills/` (`implement-spec`, `release`, plus vendored `find-skills`,
  `skill-creator`, `mcp-builder` — the vendored three hash-pinned in
  `skills-lock.json`).
- **Fixture**: `workbench/example-corpus/` — a tiny governed corpus exercising
  the same rules adopters will live under.

## Designed, not implemented

- `ksor dev` / `build` / `serve` — the remaining verbs (each still exits
  `2` with an honest notice; the scaffold's own `pnpm dev` / `pnpm build`
  work today without them).
- The MCP agent surface (`instance.md` prose is its reserved system prompt).
- Build provenance records (`build.lock.json`) — designed with `ksor build`.
- Governed directives (`:::quiz` etc.) — no grammar ratified yet; shells
  pass them through as readable text (spec, deferred 2026-08-18).
- The agent-eval harness (contract in AGENTS.md → Testing); until it
  exists, acceptance (6) runs as a manual rubric-scored walk.
- Doc code-sample checking (`check-snippets`) — deferred until the docs carry
  import fences worth verifying.

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
