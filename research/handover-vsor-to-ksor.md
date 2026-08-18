---
issue: https://github.com/panaversity/ksor/pull/1
status: accepted
last_updated: 2026-08-18
---

# Engineering handover — vsor → ksor (2026-08-17)

The predecessor repository is
[panaversity/zia-vsor-sdk](https://github.com/panaversity/zia-vsor-sdk);
kernel: `sor-agentfactory @ ac5ebf7`. This document preserves the handover in
the repository because the predecessor's documented failure was exactly this:
decisions cited at a path that was never written, surviving only in one
assistant's memory. Every claim was verified against a live registry, a
running build, or a file at a stated coordinate on 2026-08-17, except where
marked thin. **Where this document and the code disagree, the code wins.**

## State at handover (verified 2026-08-17)

- npm `@panaversity/ksor` 0.0.0 — published, public, Apache-2.0.
- PyPI `ksor` — unclaimed, freely claimable by anyone (deliberately; see
  AGENTS.md → Decisions, open questions).
- PyPI `vsor` 0.1.4 — live, CI green. npm `vsor` — not ours (unrelated
  serialization package).
- Predecessor CI green ×3 (gate · surface · hosting); working product: `init`,
  `dev`, `build` implemented and released; `serve` an honest exit-2 stub.
  330 unit + 28 boundary + 42 browser + 25 hosting checks.
- Live demo: vsor-demo.vercel.app.

## Settled decisions

The independently-endorsed ones are recorded in AGENTS.md → Decisions;
inherited items this repo has not re-validated (the Python kernel split, the
PyPI stance) are held there as open questions — this repository treats the
predecessor as reference material, not authority.

## What crosses

| Asset                                                     | Size                | Effort                   |
| --------------------------------------------------------- | ------------------- | ------------------------ |
| Site shell — forked Docusaurus app, design system         | 48 files · 6,644 ln | moves as-is              |
| lib packages — remark plugins, structured data, manifests | 10 packages         | moves as-is              |
| Playwright tiers — surface + deploy acceptance            | 9 specs · 67 tests  | moves as-is              |
| Specs — init, build, surface, instance-format             | 4                   | design, language-neutral |
| Scaffold — AGENTS.md, 4 rules, 14 agent skills            | 29 files            | markdown, direct         |
| build.lock.json — provenance record, format 2             | design              | direct                   |

The part that does not cross is mostly a **deletion, not a port**: 10 Python
modules / 3,448 lines. The largest piece — `site_runtime.py`'s
materialization, the wheel transport, `_site_runtime` staging, `make wheel`
packing nine tarballs, the `.materialized.json` staleness stamp — ceases to
exist in an npm design. The site shell becomes an ordinary dependency. What
actually needs writing is `init`, `dev`, and `build` as thin TypeScript
commands.

## Blocked, and on whom

- **The Python copy grant blocks the kernel.** Not a licence decision — that
  closed 2026-08-11 (Apache-2.0, whole repo). The predecessor's own rule
  (its `docs/extraction.md:11-22`): "Python side (`sor-agentfactory/packages/*`)
  — still not granted. Read and cite freely; do not move code until it is."
  The JS half was granted 2026-08-13 and shipped.
- **Part A, upstream — tell them today.** Five PRs in flight in
  sor-agentfactory make sor-content embedding-provider-agnostic so it could
  cross into a _Python_ framework. The destination changed; their value drops
  to "good hygiene upstream", and PR 2's blast radius includes the nightly
  eval-before-flip gate. They should hear this before they finish.
- **PyPI name deliberately not claimed** — AGENTS.md → Decisions, open questions.

## Four defects that cost days

Each was found on a **deployed artifact**, not in review. The class is the
same every time: the tier tested something structurally different from the
artifact.

| Defect                                        | Mechanism                                                                                                                                                                                                                                                                                  | Why nothing caught it                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Every CSS module lost padding, margin, border | The shipped manifest declared no browserslist, so a real build resolved defaults including browsers without cascade layers; postcss-preset-env rewrote every `@layer` into `:not(#\#)` chains, lifting Tailwind's preflight to specificity (2,0,0). 6,451 such selectors shipped in 0.1.2. | The browser tier copied the app directory and inherited its browserslist. 42 checks green — including one written for this exact failure mode. |
| Tier and artifact ran different compilers     | The fixture resolved from the workspace tree; a real build installs from the shipped lockfile. 65 packages differed — including lightningcss and @swc/core.                                                                                                                                | Nothing compared the two trees. Fixed by installing the shipped tree and moving the fixture outside the repo.                                  |
| "Hot reload broken" on CI for months          | Not broken: colorette enables colour when CI and GITHUB_ACTIONS are set regardless of tty, so rspack emitted compiled `\033[32m` and a literal grep counted zero forever.                                                                                                                  | GitHub renders ANSI away, so the log showed the exact line the script insisted it never saw.                                                   |
| Three browser rows red only on Linux          | Two measured a fixed overlay against `window.innerWidth`, which includes a 15px scrollbar the initial containing block excludes; one read a detached node after hydration and got `""` from getComputedStyle.                                                                              | macOS overlay scrollbars are 0px and never lost the race. First CI run that reached the suite found all three.                                 |

**The rule these four produce** (codified in AGENTS.md → Testing): assert on
computed style and shipped bytes, not behaviour alone; make the test tier
install the same tree the artifact installs; and when a row fails, make its
message print the value it actually saw.

## Two mistakes from the handover session

Recorded in AGENTS.md → Decisions (decision 2 and the PyPI open question) and here: a registry 404 does not
mean a name is publishable (`ksor` was rejected with E403 by npm's
publish-time similarity gate), and a PyPI pending publisher reserves nothing.

## "Do these first" — status as of 2026-08-18

1. Reference study → written primitives proposal — **done**:
   `research/primitives-proposal.md` (eve and next.js studied in
   `research/base-environment.md`; better-auth, shadcn/ui, the predecessor
   scaffold, and the docs-framework risk studied for the proposal).
2. Decision record — **done** (consolidated into AGENTS.md → Decisions).
3. `docs/status.md` — **done**.
4. Changelog with a 0.0.0 entry — **done** (`packages/ksor/CHANGELOG.md`, the changesets-owned location).
5. Make panaversity/ksor public — **already public** (verified 2026-08-18).
6. Configure the npm Trusted Publisher — **owner action, pending**
   (`docs/status.md`).
7. Repoint the vsor PyPI Trusted Publisher — **owner action, pending**.
8. Predecessor issues #1 (shadcn primitives) and #2 (reviewable lockfile) —
   **carried across** to this repository on PR creation.

## Where the evidence is thin

Stated so nobody fills these with confident estimates:

- No benchmark compares coding-agent success on `npx` versus `uvx`; the
  central premise of an agent-first tool is unmeasured by the industry.
- The Docusaurus bet deserved its own decision — taken up, with fresh
  evidence, in `research/primitives-proposal.md` §4.
- Registry download counts mislead: `create-docusaurus` runs ~23K/month
  against `@docusaurus/core`'s 5.57M — scaffolding events are two orders of
  magnitude rarer than headline numbers suggest.
- Contributor-pool size is not a real argument: roughly half of open-source
  contributors contribute exactly once, together under 2% of commits.
