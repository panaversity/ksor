---
status: ratified
date: 2026-08-18
claim: an agent-operable repository — the base every verb is built on
evidence: research/base-environment.md · research/handover-vsor-to-ksor.md · research/primitives-proposal.md
---

# Base environment

The one-page contract for the repository itself — the timeless reference a
working agent holds. Written after the build (the spec rule arrived
mid-flight) and ratified against the gate that already proves it. Where this
page and the code disagree, the code wins and this page is corrected in the
same commit.

## Observable contract

- **One agent contract.** `AGENTS.md` at the root; `CLAUDE.md` is a symlink
  to it. It holds only what stays true; `docs/status.md` holds what is built
  this week.
- **The command vocabulary is stable.** Every command in AGENTS.md → Commands
  exists in root `package.json` and stays green: lint, fmt, typecheck
  (packages + `scripts/`), guard, check:corpus, test:unit, build,
  test:integration, publint. The scripts are the contract; the tools behind
  them are replaceable.
- **The CLI exit contract**: `0` help/version · `1` refused, first stderr
  line a stable slug · `2` designed but not implemented · `3` environment.
  Exported as `exitCodes` from the package root.
- **The tarball ships its contract files** — dist entry points, `docs/`,
  LICENSE, NOTICE, CHANGELOG.md — asserted on packed bytes by the tarball
  test, never assumed from configuration.
- **Corpus rules are machine-enforced**: governed frontmatter with
  provenance, no authored `id:`/`name:`, no dead links, closed status
  lifecycle — and every violation prints what is wrong, why the rule exists,
  and the fix.
- **Boundaries are enrolled at baseline zero**: every workspace package
  appears in `ALLOWED`; nothing imports the CLI.
- **Releases leave CI only** — trusted publishing, after the full gate runs
  in the publishing job itself.

## Acceptance

On a clean machine:
`pnpm lint:ci && pnpm fmt:ci && pnpm typecheck && pnpm guard && pnpm check:corpus && pnpm test:unit && pnpm build && pnpm test:integration && pnpm publint`
— the same nine checks CI runs — plus a live walk of the packed tarball
(help exit 0, unknown verb exit 1 with slug, designed verb exit 2, bundled
docs present).

## Out of scope

The verbs (`init`, `dev`, `build`, `serve`), both surfaces, and the scaffold
— each arrives with its own one-page spec under `specs/ksor/<verb>/`, citing
the research it distills.
