/**
 * The audience seam: which documents a viewer at a given tier may be served.
 *
 * `visibility:` was the record's access-control model and was enforced in
 * exactly one place — the site's build-time staging step. Ingest dropped the
 * key, so the MCP door had nothing to filter on and served restricted documents
 * to every agent (review 2026-08-20, reproduced live). Schema 2.2 carries
 * `content_nodes.visibility`; this module is the predicate that uses it, bound
 * into search, read and outline the way `lib/takedown.ts` binds denial — ONE
 * seam, so a path cannot quietly skip it.
 *
 * The model is the site's, deliberately unchanged: `audiences:` is ordered
 * least- to most-restricted with the public tier first, and a viewer at tier i
 * may see any document whose visibility sits at or below i. A document that
 * declares no visibility takes `default_visibility`.
 */

export interface AudienceModel {
  /** Ordered least- to most-restricted; empty = the record declares no model. */
  readonly audiences: readonly string[];
  /** The tier a document takes when it names none. */
  readonly defaultVisibility: string | null;
}

export class AudienceError extends Error {
  override readonly name: string = "AudienceError";
}

/**
 * The visibility values a viewer at `viewer` may be served, or `null` when the
 * record declares no audience model at all (nothing to filter — the level-0
 * shape, unchanged).
 *
 * A viewer tier the model does not know is an ERROR, never a silent widening:
 * the failure mode this whole seam exists to end is a filter that quietly
 * passes everything.
 */
export function visibleTiers(model: AudienceModel, viewer: string | null): string[] | null {
  if (model.audiences.length === 0) {
    // A tier was ASKED for against a record that declares none. Ignoring it
    // silently served the whole record to a caller who explicitly narrowed
    // themselves — the site refuses this exact configuration by name
    // (round-1 review of #43).
    if (viewer !== null && viewer !== "") {
      throw new AudienceError(
        `an audience ${JSON.stringify(viewer)} was requested, but this record declares no ` +
          "`audiences:` model — so nothing can be narrowed and the whole record would be " +
          "served. Declare audiences: in instance.md, or unset KSOR_AUDIENCE.",
      );
    }
    return null;
  }
  const tier = viewer ?? model.audiences[0]!;
  const index = model.audiences.indexOf(tier);
  if (index < 0) {
    throw new AudienceError(
      `unknown audience ${JSON.stringify(tier)} — this record declares ` +
        `[${model.audiences.join(", ")}]. Serving an unknown tier would have to guess how much ` +
        "of the record it may show; refusing.",
    );
  }
  return model.audiences.slice(0, index + 1);
}

/**
 * The sentinel for "this record declares no audience model".
 *
 * It is a VALUE, not the absence of one, and that is the whole point. The
 * predicate used to read an UNBOUND GUC as "no model" and evaluate TRUE, so a
 * statement running with no scope bound served every tier.
 *
 * Two layers, and it matters which is which:
 *
 *   SQL      an unbound `app.audience_tiers` matches NOTHING. A statement that
 *            somehow runs outside `runRead` returns no rows rather than the
 *            whole record.
 *   runRead  binds this sentinel by DEFAULT, so a library caller that does not
 *            narrow gets the whole record — stated, not inherited from an
 *            unbound GUC.
 *
 * So the serving DOOR is what must be right: `service.ts` overrides the default
 * on every path with the caller's tier, and `audience-binding.test.ts` asserts
 * that none of them can lose it. The SQL is the backstop, not the guarantee
 * (round-3 review of #43 corrected the earlier, overstated claim).
 */
const NO_MODEL: string = "*";

/** The unit separator, chosen because no audience name may contain it. */
const SEP = "\u001f";

/**
 * The serving-path predicate, written against transaction GUCs rather than
 * positional parameters.
 *
 * The retrieval statements share one `ARM_WHERE` string and renumber its
 * parameters by substitution (`$5` -> `$4`), so threading a new positional
 * parameter through them is exactly the fragile edit a reviewer flagged. GUCs
 * compose the way the tenant wall already does — bound transaction-locally in
 * the same `set_config` round trip, invisible to the numbering, and impossible
 * to leak to the next pool borrower.
 *
 * Parameterised by TABLE ALIAS, because the outline's child_count subquery
 * scans a second alias — and hand-copying the predicate for it produced two
 * copies of the seam this module exists to make singular, which promptly
 * drifted apart and returned child_count 0 for every node (review of PR #43,
 * found by its own test).
 *
 * `app.audience_tiers = '*'` means "this record declares no audience model".
 * UNBOUND means nobody stated a scope, and the predicate matches nothing —
 * fail closed, so a forgotten binding is an outage rather than a leak.
 */
/**
 * `nullif(…, '')` because an EMPTY `visibility:` means the same as declaring
 * none, and the TypeScript half of this rule has always said so. The SQL left
 * `''` alone, so it matched no tier and the document was served to nobody while
 * the site published it at `default_visibility` — a disagreement decision 18's
 * shared table is supposed to make impossible, and did not catch because the
 * one empty-string row expected `false` under both readings for different
 * reasons (round-5 review of #43). Not reachable today — both frontmatter
 * readers reject an empty `visibility:` earlier — which is exactly why it had
 * to be fixed before something made it reachable.
 */
export function audienceAllowed(alias: string): string {
  return `(
    current_setting('app.audience_tiers', true) = '${NO_MODEL}'
    OR coalesce(nullif(${alias}.visibility, ''), coalesce(current_setting('app.default_visibility', true), '')) =
       ANY (string_to_array(coalesce(current_setting('app.audience_tiers', true), ''), E'\\x1f'))
)`;
}

/** The predicate for the usual `n` alias. */
export const AUDIENCE_ALLOWED: string = audienceAllowed("n");

/**
 * The GUCs {@link AUDIENCE_ALLOWED} reads. Empty object when the record
 * declares no model, so nothing is bound and the predicate stays TRUE.
 */
export function audienceGucs(
  model: AudienceModel,
  viewer: string | null,
): Readonly<Record<string, string>> {
  const tiers = visibleTiers(model, viewer);
  // Bound EXPLICITLY even when there is no model, so every serving path states
  // its audience scope and a missing one cannot be mistaken for "unrestricted".
  if (tiers === null) return { "app.audience_tiers": NO_MODEL };
  return {
    "app.audience_tiers": tiers.join(SEP),
    // A document that declares no visibility takes this tier. Bound as the
    // empty string when the record names no default, which matches no allowed
    // tier — so an undeclared document in a record with an audience model but
    // no default fails CLOSED rather than being served to everyone.
    "app.default_visibility": model.defaultVisibility ?? "",
  };
}

/**
 * The scope for a caller that is entitled to the WHOLE record: calibration
 * (the floor is a property of the corpus, not of one tier), ingest-side
 * verification, and tests that assert on the record as a whole.
 *
 * It exists so "everything" is something a caller SAYS rather than something
 * that happens when nobody binds a scope.
 */
export const WHOLE_RECORD_SCOPE: Readonly<Record<string, string>> = audienceGucs(
  { audiences: [], defaultVisibility: null },
  null,
);
