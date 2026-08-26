/**
 * The ONE decision table both surfaces must satisfy — {@link AUDIENCE_CASES},
 * the OVERLAP rule of record spec §2.4.
 *
 * The visibility leak was closed and re-entered through FOUR successive doors
 * (no column; flow-style `audiences:` parsed as a scalar; a sibling parse
 * failure emptying the whole frontmatter map; two `FRONTMATTER` regexes
 * disagreeing where the block ends). Every one of them was a case where the
 * site and the kernel implemented the same rule twice and drifted — and each
 * side's own tests stayed green, because each side was self-consistent.
 *
 * So the rule stops living in two heads. This table is the rule, and every
 * implementation is asserted against it:
 *
 *   SQL   `audience-conformance.db.test.ts` runs the real predicate in
 *         Postgres, with the GUC bound as `runRead` binds it, and the section
 *         rows through the real `admitted` CTE.
 *   TS    `lib/audience-overlap.test.ts` runs `overlaps`, the kernel's copy.
 *   TS    `packages/ksor/src/audience-conformance.test.ts` runs the SITE's
 *         byte-identical copy of that file — the one `stage-knowledge.ts`
 *         admits with (`audience-rule-drift.integration.test.ts` proves the
 *         two are the same bytes).
 *
 * A FIFTH door was found in the test suite rather than in the rule, and is
 * recorded here because it is the same failure mode: the site's half asserted
 * `decideVisible` against a RANKED table that no surface had read since the
 * overlap rule replaced it, so it could stay green forever while the site's
 * real staging rule broke. Both the dead rule and the retired table are gone;
 * the site's half now runs the site's own file against the rows below.
 *
 * What the table does NOT cover, stated so it is not mistaken for coverage:
 * `viewer()` (how KSOR_AUDIENCE resolves) is the INPUT to the rule, tested
 * where it lives. The table is about the decision, not the reading.
 *
 * A surface that drifts fails on the row it broke, naming the case rather than
 * the symptom.
 *
 * Product principle 2: one source, two surfaces — never let them read
 * different truths.
 */

/**
 * THE audience decision table (record spec §2.4).
 *
 * A concept holds a LIST of audience identifiers and a viewer holds a list
 * that always includes `public`; the concept is visible when the two OVERLAP.
 * Rank moved to the viewer and membership stayed on the document, which let
 * the ranked rule's ordinary ladder carry over row for row — except its rows
 * about DEFAULTING, and those are here as refusals, because under the profile
 * an audience is never inferred:
 *
 *   an undeclared or empty `visibility:` took `default_visibility`. There is
 *   no default now (`ksor-audience-missing`), and `default_visibility:` is
 *   itself refused out of `instance.md`.
 *
 *   a record that declared no audience model published everything.
 *   `ksor.audience` is required at level 0 too; what level 0 means is that the
 *   only identifier a record needs is `public`.
 *
 * A row carrying `refusal` names the checker slug that makes the state
 * unauthorable. It is still asserted through the SQL — a refused state must
 * ALSO be served to nobody if it ever reaches a row by another route (a
 * hand-written INSERT, a carried pre-profile generation), which is the
 * difference between a rule and a validation.
 *
 * Asserted through every implementation listed at the top of this file.
 */
export interface AudienceCase {
  /** What makes this row worth having. Printed on failure. */
  readonly name: string;
  /** The viewer's list — always includes `public` once validated upstream. */
  readonly viewer: readonly string[];
  /** The concept's `ksor.audience`; null = the row carries none at all. */
  readonly audience: readonly string[] | null;
  readonly visible: boolean;
  /**
   * When set: the checker refuses this state, so it cannot be authored. The
   * row asserts what serving does with it anyway.
   */
  readonly refusal?: "ksor-audience-missing" | "ksor-audience-unregistered";
  /**
   * When set: this row is a SECTION, which declares no audience of its own and
   * is admitted iff a descendant is visible. `audience` is null on such a row
   * and `visible` is the admission verdict; the listed lists are its
   * descendants' (`lib/admit.ts` resolves them by a recursive `parent_id` walk).
   */
  readonly section?: { readonly descendants: readonly (readonly string[])[] };
}

export const AUDIENCE_CASES: readonly AudienceCase[] = [
  // ── the overlap ladder ─────────────────────────────────────────────────
  {
    name: "public viewer sees a public concept",
    viewer: ["public"],
    audience: ["public"],
    visible: true,
  },
  {
    name: "public viewer does NOT see an internal concept",
    viewer: ["public"],
    audience: ["internal"],
    visible: false,
  },
  {
    name: "internal viewer sees an internal concept",
    viewer: ["public", "internal"],
    audience: ["internal"],
    visible: true,
  },
  {
    name: "internal viewer sees a public concept too",
    viewer: ["public", "internal"],
    audience: ["public"],
    visible: true,
  },
  {
    name: "internal viewer does NOT see a board concept",
    viewer: ["public", "internal"],
    audience: ["board"],
    visible: false,
  },

  // ── three tiers, the shape an adopter reaches for first ────────────────
  {
    name: "a three-tier viewer sees a concept in any of its tiers",
    viewer: ["public", "internal", "board"],
    audience: ["board"],
    visible: true,
  },
  {
    name: "a concept for two audiences is visible to a viewer holding either",
    viewer: ["public", "board"],
    audience: ["internal", "board"],
    visible: true,
  },
  {
    name: "…and not to a viewer holding neither",
    viewer: ["public", "finance"],
    audience: ["internal", "board"],
    visible: false,
  },

  // ── a typo is a RESTRICTION, never a widening — and is refused upstream ─
  {
    name: "an unregistered identifier on the concept is a restriction, never a widening",
    viewer: ["public", "internal"],
    audience: ["board-only"],
    visible: false,
    refusal: "ksor-audience-unregistered",
  },

  // ── nothing is DEFAULTED: what the ranked rule took from a default ─────
  {
    name: "an EMPTY audience list is served to nobody — omission is refused, never defaulted",
    viewer: ["public"],
    audience: [],
    visible: false,
    refusal: "ksor-audience-missing",
  },
  {
    name: "…and so is a row carrying NO list at all (a pre-profile generation's)",
    viewer: ["public"],
    audience: null,
    visible: false,
    refusal: "ksor-audience-missing",
  },
  {
    name: "a record with only `public` is level 0, not `no model` — the concept still declares it",
    viewer: ["public"],
    audience: ["public"],
    visible: true,
  },

  // ── sections: no list of their own, admitted through a descendant ──────
  {
    name: "a section is admitted iff a descendant is visible — it carries no list of its own",
    viewer: ["public"],
    audience: null,
    visible: true,
    section: { descendants: [["public"]] },
  },
  {
    name: "a section whose every descendant is internal is absent for a public viewer",
    viewer: ["public"],
    audience: null,
    visible: false,
    section: { descendants: [["internal"], ["internal", "board"]] },
  },
  {
    name: "…and present for a viewer holding internal",
    viewer: ["public", "internal"],
    audience: null,
    visible: true,
    section: { descendants: [["internal"], ["internal", "board"]] },
  },
  {
    name: "an EMPTY section — a directory whose documents are all withdrawn — is admitted to nobody",
    viewer: ["public", "internal", "board"],
    audience: null,
    visible: false,
    section: { descendants: [] },
  },
];

export interface WideningCase {
  readonly name: string;
  readonly source: readonly string[];
  readonly target: readonly string[];
  readonly reaches: boolean;
}

export const WIDENING_CASES: readonly WideningCase[] = [
  {
    name: "[internal] → [public] passes: every reader of the source can read the target",
    source: ["internal"],
    target: ["public"],
    reaches: true,
  },
  {
    name: "[public] → [internal] refuses: a public reader would hit a wall",
    source: ["public"],
    target: ["internal"],
    reaches: false,
  },
  {
    name: "[internal] → [internal] passes",
    source: ["internal"],
    target: ["internal"],
    reaches: true,
  },
  {
    name: "[internal] → [internal, board] passes: the target contains every identifier of the source",
    source: ["internal"],
    target: ["internal", "board"],
    reaches: true,
  },
  {
    name: "[internal, board] → [internal] refuses: a board reader of the source cannot read the target",
    source: ["internal", "board"],
    target: ["internal"],
    reaches: false,
  },
  {
    name: "[internal, board] → [public, internal] passes: public covers everyone",
    source: ["internal", "board"],
    target: ["public", "internal"],
    reaches: true,
  },
];
