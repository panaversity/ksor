/**
 * The ONE decision table both surfaces must satisfy.
 *
 * The visibility leak was closed and re-entered through FOUR successive doors
 * (no column; flow-style `audiences:` parsed as a scalar; a sibling parse
 * failure emptying the whole frontmatter map; two `FRONTMATTER` regexes
 * disagreeing where the block ends). Every one of them was a case where the
 * site and the kernel implemented the same rule twice and drifted — and each
 * side's own tests stayed green, because each side was self-consistent.
 *
 * So the rule stops living in two heads. This table is the rule, and both
 * implementations are asserted against it:
 *
 *   SQL   `audience-conformance.db.test.ts` runs the real predicate in
 *         Postgres, with the GUCs bound as `runRead` binds them.
 *   TS    `packages/ksor/src/audience-conformance.test.ts` runs
 *         `decideVisible`, the canonical rule the scaffold copies verbatim
 *         (`audience-rule-drift.test.ts` fails if the copy drifts).
 *
 * What the table does NOT cover, stated so it is not mistaken for coverage:
 * the site's `visibilityOf` (how a `visibility:` is read out of frontmatter)
 * and `buildAudience` (how KSOR_AUDIENCE resolves) are the INPUTS to the rule,
 * tested where they live. The table is about the decision, not the reading.
 *
 * A surface that drifts fails on the row it broke, naming the case rather than
 * the symptom.
 *
 * Product principle 2: one source, two surfaces — never let them read
 * different truths.
 */

export interface AudienceCase {
  /** What makes this row worth having. Printed on failure. */
  readonly name: string;
  /** Ordered least- to most-restricted; empty = the record declares no model. */
  readonly audiences: readonly string[];
  /** The tier a document takes when it declares none. */
  readonly defaultVisibility: string | null;
  /** The document's declared `visibility:`; null = it declares none. */
  readonly visibility: string | null;
  /** The tier being served. null = an unidentified caller. */
  readonly viewer: string | null;
  /** May this viewer be served this document? */
  readonly visible: boolean;
}

const MODEL = ["public", "internal", "restricted"] as const;

export const AUDIENCE_CASES: readonly AudienceCase[] = [
  // ── the ordinary ladder ────────────────────────────────────────────────
  {
    name: "public viewer sees a public document",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "public",
    viewer: "public",
    visible: true,
  },
  {
    name: "public viewer does NOT see an internal document",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "internal",
    viewer: "public",
    visible: false,
  },
  {
    name: "public viewer does NOT see a restricted document",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "restricted",
    viewer: "public",
    visible: false,
  },
  {
    name: "internal viewer sees an internal document",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "internal",
    viewer: "internal",
    visible: true,
  },
  {
    name: "internal viewer sees everything LESS restricted too",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "public",
    viewer: "internal",
    visible: true,
  },
  {
    name: "internal viewer does NOT see a restricted document",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "restricted",
    viewer: "internal",
    visible: false,
  },
  {
    name: "the most-restricted viewer sees the whole record",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "restricted",
    viewer: "restricted",
    visible: true,
  },

  // ── the default, which is where an undeclared document lands ───────────
  {
    name: "an undeclared document takes default_visibility (public) and is public",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: null,
    viewer: "public",
    visible: true,
  },
  {
    name: "an undeclared document takes default_visibility (internal) and is NOT public",
    audiences: MODEL,
    defaultVisibility: "internal",
    visibility: null,
    viewer: "public",
    visible: false,
  },
  {
    name: "an EMPTY visibility: is the same as declaring none",
    audiences: MODEL,
    defaultVisibility: "internal",
    visibility: "",
    viewer: "public",
    visible: false,
  },
  {
    // The row that DISTINGUISHES the two readings. With default_visibility
    // public, "empty means the default" is visible and "empty is a tier named
    // ''" is not — so a surface that gets this wrong now fails, where the row
    // above passed under both readings for different reasons.
    name: "…and an empty visibility: with a PUBLIC default is published",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "",
    viewer: "public",
    visible: true,
  },

  // ── an unidentified caller gets the LEAST privilege, never the most ────
  {
    name: "an unidentified caller is treated as the first (public) tier",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "internal",
    viewer: null,
    visible: false,
  },
  {
    name: "…and still sees what that tier may see",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "public",
    viewer: null,
    visible: true,
  },

  // ── a typo is a RESTRICTION, never a widening ──────────────────────────
  {
    name: "a document declaring a tier the model does not know is served to NOBODY",
    audiences: MODEL,
    defaultVisibility: "public",
    visibility: "board-only",
    viewer: "restricted",
    visible: false,
  },

  // ── the level-0 shape: no model at all ─────────────────────────────────
  {
    name: "a record with no audience model serves everything",
    audiences: [],
    defaultVisibility: null,
    visibility: null,
    viewer: null,
    visible: true,
  },
  {
    name: "…including a document that declares a visibility nothing interprets",
    audiences: [],
    defaultVisibility: null,
    visibility: "internal",
    viewer: null,
    visible: true,
  },
];
