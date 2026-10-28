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

## Question

What is the state of the `vsor` to `ksor` engineering handover, what assets are crossing to the new repository, what decisions have been settled or are pending, what defects were identified, and what lessons were learned to inform future development?

## Evidence

As of 2026-08-17:

- `@panaversity/ksor` 0.0.0 is published on npm (public, Apache-2.0).
- `ksor` on PyPI is unclaimed; `vsor` 0.1.4 is live on PyPI.
- Predecessor CI is green with `init`, `dev`, `build` implemented and released; `serve` is a stub.
- Live demo at `vsor-demo.vercel.app`.

Assets crossing to `ksor` include:

- Site shell (forked Docusaurus app, design system): 48 files, 6,644 lines, moves as-is.
- Lib packages (remark plugins, structured data, manifests): 10 packages, moves as-is.
- Playwright tiers (surface + deploy acceptance): 9 specs, 67 tests, moves as-is.
- Specs (init, build, surface, instance-format): 4 specs, design/language-neutral.
- Scaffold (AGENTS.md, 4 rules, 14 agent skills): 29 markdown files, direct transfer.
- `build.lock.json` (provenance record, format 2): design, direct transfer.

Python modules (10 modules / 3,448 lines) do not cross; they are deleted, not ported.

Blocked items and their resolution:

- The Python copy grant blocked the kernel (resolved 2026-08-18: owner granted whole body of predecessor work).
- Upstream PRs in `sor-agentfactory` making `sor-content` embedding-provider-agnostic (value changed due to destination change).
- PyPI name deliberately not claimed.

Four defects found on deployed artifacts that cost days:

1. CSS modules lost padding, margin, border due to `browserslist` issue and `postcss-preset-env` rewriting `@layer` into `:not(#\#)` chains.
2. Tier and artifact ran different compilers (fixture resolved from workspace tree; real build from shipped lockfile).
3. "Hot reload broken" on CI: `colorette` enabled color in CI, causing `rspack` to emit compiled ANSI, which `grep` failed to match.
4. Three browser rows red only on Linux due to `window.innerWidth` including scrollbar width and `getComputedStyle` reading detached nodes.

Two mistakes from the handover session:

1. A registry 404 does not mean a name is publishable (`ksor` was rejected by npm's similarity gate).
2. PyPI pending publisher reserves nothing.

Status of "Do these first" items as of 2026-08-18:

- Reference study → written primitives proposal: Done (`research/primitives-proposal.md`).
- Decision record: Done (consolidated into AGENTS.md → Decisions).
- `docs/status.md`: Done.
- Changelog with 0.0.0 entry: Done (`packages/ksor/CHANGELOG.md`).
- Make `panaversity/ksor` public: Already public.
- Configure npm Trusted Publisher: Owner action, pending.
- Repoint `vsor` PyPI Trusted Publisher: Owner action, pending.
- Predecessor issues #1 and #2: Carried across.

## Decision

The handover preserves the predecessor's documentation of failure: decisions cited at a path that was never written, surviving only in one assistant's memory. This document ensures all claims are verified against live registry, running build, or stated file coordinates. "Where this document and the code disagree, the code wins."

Settled decisions, independently endorsed, are recorded in AGENTS.md → Decisions. Inherited items not re-validated (Python kernel split, PyPI stance) are open questions in AGENTS.md.

The decision was made to delete, not port, 10 Python modules (3,448 lines) and to write `init`, `dev`, and `build` as thin TypeScript commands.

Based on identified defects, the following rules were codified in AGENTS.md → Testing:

- Assert on computed style and shipped bytes, not behavior alone.
- Make the test tier install the same tree the artifact installs.
- When a row fails, its message must print the value it actually saw.

## Rejected

- **Porting Python modules**: 10 Python modules / 3,448 lines were not ported but deleted, as the `site_runtime.py` materialization, wheel transport, and associated packing mechanisms cease to exist in an npm design.
- **Unclaimed PyPI name**: Deliberately not claimed, as recorded in AGENTS.md → Decisions, open questions.
- **Direct copy of Python kernel**: Blocked initially by a Python copy grant, resolved on 2026-08-18 by owner grant, but the original blockage is recorded.
- **Trusting registry 404 for publishability**: Rejected; a 404 does not guarantee a name is publishable (e.g., `ksor` was rejected by npm's similarity gate).
- **Assuming PyPI pending publisher reserves a name**: Rejected; it reserves nothing.

## Reversal

- **Python kernel migration**: The initial blocking condition (Python copy grant) was reversed on 2026-08-18 when the owner granted the whole body of predecessor work for TypeScript conversion. A future lack of such a grant, or a change in licensing, could reverse the ability to port.
- **PyPI name claim**: The deliberate decision not to claim the PyPI `ksor` name is an open question in AGENTS.md. Future strategic changes might lead to claiming it.
- **Assumptions about agent success on `npx` vs `uvx`**: This is noted as "thin evidence." New benchmarks comparing agent success rates could lead to a reversal of underlying assumptions about agent-first tools.
- **Docusaurus bet**: The Docusaurus choice was noted as having "thin evidence" and deserving its own decision. `research/primitives-proposal.md` §4 was intended to take this up with fresh evidence, implying that new evidence could lead to a reversal of this decision.
- **Contributor-pool size as an argument**: The evidence for this is thin. New data challenging the assertion that contributor-pool size is not a real argument could lead to its reconsideration in decision-making.

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
  _Resolved 2026-08-18: the owner granted the whole body of predecessor work
  for conversion to TypeScript — recorded as AGENTS.md decision 6. This item
  is kept for the record; it no longer blocks anything._
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
  _Resolved 2026-08-18: the owner granted the whole body of predecessor work
  for conversion to TypeScript — recorded as AGENTS.md decision 6. This item
  is kept for the record; it no longer blocks anything._
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
