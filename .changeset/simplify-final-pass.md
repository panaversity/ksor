---
"@panaversity/ksor": patch
---

**Cuts and corrections from the final simplification pass.** Nothing here
changes what the tool does; it removes code that had stopped being reachable
and corrects three comments that had stopped being true — plus one hand copy
of a rule that was actively wrong.

- **`page-order.ts` is gone**, both copies. It sorted the site's page tree
  until this release replaced that path with the generated indexes, after which
  its only remaining callers were the drift tests asserting the two copies
  matched — a guard on dead code. The tie-break reasoning it recorded (a
  folder's descendant url compares against a sibling in the wrong order,
  because `/` sorts after `-`) moves onto the live `routeAt`, which performs
  the defence and did not say why.
- **The attachment suffix list had a fifth hand copy**, in the site's staging
  step, and it was wrong: it claimed byte-identity with a checker that had
  moved to the canonical rule, and it was missing `.summary.mdx`, so the stage
  and the lock writer disagreed about which files are attachments. Both
  divergences were masked by earlier refusals, so nothing was observable — the
  shape decision 18 exists to catch. It now calls the canonical rule, as does a
  sixth copy found in a test fixture, where a fixture classifying attachments
  by its own rule could not detect the code under test classifying them
  differently.
- **The guard that should have caught those two** scanned one directory and
  skipped test files. A copy was sitting in each blind spot. It now covers the
  emitted scaffold and tests as well.
- **`splitFrontmatter` in the ingest module is gone.** Decision 26 made
  `record/frontmatter.ts` the one reader and every caller moved; what was left
  behind was an unused copy whose test asserted three behaviours the product
  had deliberately abandoned.
- Also removed: three exported helpers in the site's attachment module that
  never had a caller, a predicate parameter no caller ever passed, and a
  test that asserted `true`.

**Two guarantees gained an assertion**, both found while looking for
redundancy rather than for holes:

- **The trust tier now has a conformance table.** It had two implementations —
  the kernel's and the site's, which cannot import the kernel — and nothing
  asserting they agree, while the tier is stamped into every `/md/` twin and
  stored as the column the MCP door's `min_trust_tier` floor compares against.
  Both halves now run the same rows, including one the previous hand-written
  expectations did not cover: an actor whose producer merely contains the word
  `human` is a machine.
- **`GATE_PREDICATE_DIGEST` is pinned by value, not by shape.** It was asserted
  only to be twelve hex characters. Every `ksor calibrate` writes it into the
  adopter's `instance.md` and the door compares it at boot, so a whitespace-only
  reflow of the serving predicate would have invalidated every calibrated floor
  in the field with nothing going red.
