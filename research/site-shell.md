---
issue: AGENTS.md → Decisions, open question "the site shell" (set to the PR URL when this opens)
status: proposed
last_updated: 2026-08-18
---

# The site shell — Docusaurus or Fumadocs

The one open toolchain question left before the site slice. AGENTS.md records
it as undecided; this file is the evidence and the argument, and it is the
only home for both. `research/primitives-proposal.md` §4 points here.

> **Revision note (2026-08-18):** primitives-proposal.md §4 recommended
> **Docusaurus**. That recommendation is preserved below and is now
> **challenged, not withdrawn** — two arguments it did not weigh push the
> other way, and one decision (4) was never applied to the question. Nothing
> is settled until the deciding question at the end is answered by the owner.

## What is actually being chosen

Not "which docs framework." ksor's MCP surface ships in the **CLI**, not the
site, and `ksor build` will assert the shipped bytes either way. So the site
shell sits _behind_ ksor's own build contract: whichever wins, the product
promise is owned by ksor and a later swap changes an implementation, not a
guarantee.

What is genuinely at stake is narrower and worth naming precisely:

1. Who carries the shell — us or the adopter (see decision 4, below).
2. Whether the site-side agent surface (`llms.txt`, per-page markdown) is
   first-party or borrowed.
3. When the migration cost gets paid, because it gets paid either way.

## Verified evidence

Everything below was checked against primary sources on 2026-08-18. Claims
inherited from the predecessor's handover are marked as such and were not
re-used without checking.

### Docusaurus

- **No official agent surface, and none scheduled.** facebook/docusaurus#10899
  ("add `docusaurus-plugin-llms-txt`") was opened **2025-02-04** and is
  **open, unassigned, no milestone, labelled feature request**, with no
  maintainer commitment in either direction. Verified by fetching the issue.
- The v4 milestone is Rspack + MDX v3 — a major build-layer transition that
  does not include an agent surface.
- Community plugins deliver `llms.txt` and per-page markdown today
  (@signalwire ~120K downloads/month; rachfop ~92K including per-page `.md`).
  Both are unofficial and unpinned to the v4 cycle.
- Mature internationalisation — the strongest thing on this side of the
  ledger that Fumadocs does not clearly match.
- Meta-backed: the bus factor is real and favours Docusaurus.

### Fumadocs

Each of these is **first-party**, not a plugin. Verified against the Fumadocs
documentation:

- `llms(source).index()` from `fumadocs-core/source` — the `llms.txt` route.
- A `.md` route handler with `generateStaticParams()` — per-page markdown,
  **statically generated**, so it survives static export.
- `isMarkdownPreferred` / `rewritePath` from `fumadocs-core/negotiation` —
  Accept-header content negotiation.
- Official static export via Next.js `output: 'export'`.
- TypeScript-native React, which is the house stack (decision 1, decision 5).
- Essentially one maintainer. This is the honest counterweight to everything
  above and must not be buried.

### The caveat neither framework's docs make obvious

**Fumadocs' Accept-header negotiation runs in Next.js middleware, and
middleware does not exist under `output: 'export'`.**

So a fully static ksor site gets `llms.txt` and per-page `.md` — both
statically generated, both fine — but **not** content negotiation. Serving
`text/markdown` from the canonical URL requires a Node host at deploy time,
not a static bucket.

This interacts with decision 1, which makes Node a prerequisite for the
adopter's **build**. Negotiation would make a runtime a prerequisite for the
adopter's **serve**. That is a new constraint on adopters and must be chosen
deliberately, not discovered during implementation. It applies whichever
shell wins — Docusaurus offers no negotiation at all.

## The argument as it stands

### For Docusaurus (the §4 recommendation, preserved)

The predecessor's 6,644-line forked shell **crosses for free** — and, since
decision 6 (2026-08-18) granted conversion of the predecessor's work, it
crosses licence-clear as well. Moving to either alternative is a rewrite, not
a port; the fork's value goes to zero the moment we leave. The plugin risk is
made loud rather than avoided: `ksor build`'s acceptance asserts that
`llms.txt` exists and lists every published page and that per-page markdown
exists, so a plugin stranded by the v4 cycle fails CI the day it breaks,
never silently.

### Against it — three arguments §4 did not weigh

**1. "Free" is acquisition cost, not carrying cost.** A 6,644-line fork of a
framework mid-major-transition is the expensive kind of free. AGENTS.md is
explicit: never carry a mechanism across without asking what it was for.
That question has not been asked of this fork.

**2. The migration gets paid either way, and the price only rises.** The CI
mitigation is good, but a loud failure during the v4 cycle still means
migrating — the same rewrite, later, under time pressure, with adopters on
it. Today the site is zero lines and the adopter count is zero. This decision
will never be cheaper than it is now.

**3. Decision 4 was never applied to this question.** Scaffolds are
copy-into-repo; the adopter owns what `ksor init` emits. If any of the forked
shell reaches an adopter's repository, we have handed a non-technical
knowledge owner a Docusaurus fork to maintain — the opposite of "out of the
box the owner touches knowledge only." **This is the unanswered structural
question:** is the shell adopter-owned or framework-owned? If framework-owned,
decision 4 is being reversed for the largest file set in the product, and
that reversal must be recorded per-file with its reason.

### And one point of substance for the agent surface

ksor's differentiator is that agents find and read the corpus. The human
surface can sit on anything. Putting the agent-facing half on two unofficial
plugins, pinned against a framework whose official issue for that exact
feature has been unassigned for eighteen months, builds the differentiator on
someone else's neglected backlog.

## The option not on the list

**No framework — `ksor build` emits its own static site.** Recorded so nobody
re-derives it: rejected. It means rebuilding search, i18n, theming, and MDX,
none of which is the differentiator, to avoid a dependency that is swappable
by design.

## The deciding question — for the owner

**Is multilingual content a near-term requirement, or a someday?**

- **Near-term** (Urdu or any second language in the first adopter corpora):
  Docusaurus's internationalisation maturity plausibly outweighs every
  argument above, and the §4 recommendation stands as written.
- **Someday:** Fumadocs, on the reasoning above.

A second question falls out of the caveat and can be answered independently:
**must the served site do Accept-header negotiation?** If yes, adopters need
a Node runtime at serve time and only Fumadocs can do it. If no, static
export is sufficient and both shells stay in play.

## Candidate decision texts

To be pasted into AGENTS.md → Decisions once the owner answers. One of these,
not both.

> **Decision 8 — Fumadocs is the site shell.** The agent-facing half of the
> site (`llms.txt`, per-page markdown, Accept negotiation) is first-party
> there, and on Docusaurus it is an unassigned eighteen-month-old feature
> request served by unofficial plugins. The predecessor's forked shell is
> acquisition-cheap and carrying-expensive, and the migration cost away from
> Docusaurus only rises with adopters. Reversed if Fumadocs' maintenance
> stalls without a fork-worthy community, or if multilingual i18n becomes a
> near-term requirement it cannot meet.

> **Decision 8 — Docusaurus is the site shell.** The predecessor's forked
> shell crosses working and licence-clear under decision 6; the site-side
> agent surface is delivered by pinned community plugins whose output is
> asserted by `ksor build`'s shipped-bytes acceptance, so a break fails CI
> rather than shipping silently; and its internationalisation is required
> near-term. Reversed if the pinned `llms.txt` plugin breaks under the v4
> cycle without a maintained replacement, or when the shell needs its first
> major rework anyway — in which case Fumadocs is the target.

## Acceptance, whichever wins

Written now so the choice cannot quietly weaken the product guarantee. These
are `ksor build` acceptance criteria, not framework features:

- `llms.txt` exists in the build output and lists **every** published page —
  asserted against the built bytes, not against config.
- Every published page has a machine-readable markdown counterpart at a
  stable, path-derived address (product principle 3: identity derives from
  the file path).
- The site build and the MCP surface read the **same** corpus build — one
  source, two surfaces, never two truths.
- A drift test fails if a page exists on one surface and not the other.
- If negotiation is adopted: an integration test asserts that a request with
  `Accept: text/markdown` returns markdown from the canonical URL.
