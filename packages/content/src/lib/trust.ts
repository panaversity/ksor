/**
 * The trust seam — a floor under the tier a served passage's document carries.
 *
 * `trust_tier` is derived from `verified` at ingest (record spec §2.3): 0
 * unverified, 1 machine-confirmed, 2 human-reviewed. A caller that asks for
 * `human-reviewed` must never be answered from a machine-confirmed document
 * "because it ranked first", so the floor is an ARM predicate bound beside
 * `DENY`, the audience overlap and the lifecycle window — not a filter applied
 * to the hits afterwards, which ranking would have already let leak.
 *
 * Written against a transaction GUC for the same reason the audience list is
 * (`lib/audience.ts`): the retrieval statements share one predicate string and
 * renumber its parameters by substitution, so a positional parameter here
 * would have to be threaded through five statements' numbering.
 *
 * A NULL tier is read as `unverified` rather than swallowed. NULL is what a
 * pre-2.5 carried row holds, and such a generation is refused at boot by
 * `GOVERNANCE_SINCE` — so the COALESCE cannot admit ungoverned content; what
 * it prevents is a three-valued predicate quietly emptying a whole record.
 */

import { TRUST_TIERS, type TrustTier } from "../record/profile.js";

/** The GUC the predicate reads. Unset or empty means the floor is 0. */
const GUC = "app.min_trust_tier";

/** The predicate for a node aliased `alias`. */
export function trustAdmits(alias: string): string {
  return `(COALESCE(${alias}.trust_tier, 0) >= COALESCE(NULLIF(current_setting('${GUC}', true), '')::smallint, 0))`;
}

/** The predicate for the usual `n` alias. */
export const TRUST_ADMITS: string = trustAdmits("n");

/** The stored tier for a named one; the inverse of ingest's derivation. */
export function tierOrdinal(tier: TrustTier): number {
  return TRUST_TIERS.indexOf(tier);
}

/** The GUC {@link TRUST_ADMITS} reads, for a floor named or numbered. */
export function trustGucs(floor: TrustTier | number): Readonly<Record<string, string>> {
  return { [GUC]: String(typeof floor === "number" ? floor : tierOrdinal(floor)) };
}

/** The floor a caller that names none gets: every tier, `unverified` included. */
export const NO_TRUST_FLOOR: Readonly<Record<string, string>> = trustGucs(0);

/**
 * The floor that actually applies when a deployment names one and a caller
 * names another: the HIGHER of the two, always.
 *
 * Configuration may TIGHTEN and never loosen. A door configured for
 * `human-reviewed` is a deployment decision about what this record is allowed
 * to answer from; an argument on a tool call is a caller's preference, and a
 * preference must not be able to widen a deployment's rule — that is the shape
 * of every access-control bug this repository has already had (decision 18).
 *
 * The same expression is also where the DEFAULT lives: a caller who names
 * nothing is `unverified` (0), which leaves the deployment's floor standing.
 */
export function tightenTrustFloor(
  configured: TrustTier | number | undefined,
  requested: TrustTier | number | undefined,
): number {
  const ordinal = (v: TrustTier | number | undefined): number =>
    v === undefined ? 0 : typeof v === "number" ? v : tierOrdinal(v);
  return Math.max(ordinal(configured), ordinal(requested));
}

export class TrustFloorError extends Error {
  override readonly name: string = "TrustFloorError";
  readonly slug = "ksor-trust-floor-unknown" as const;
  constructor(message: string) {
    super(`ksor-trust-floor-unknown: ${message}`);
  }
}

/**
 * `KSOR_MIN_TRUST_TIER` — the deployment's own floor. Unset or empty is
 * `unverified`, which admits every tier; that is the honest default, because
 * `verified` is never required and a record with no reviews is a legitimate
 * rung on the ladder.
 *
 * A tier this does not recognise REFUSES rather than falling back. Falling back
 * would serve the record the operator meant to restrict, from a typo, with a
 * green boot — the shape of failure "honest absence, never silent weakness"
 * exists to prevent.
 */
export function parseTrustFloor(raw: string | undefined | null): TrustTier {
  const value = (raw ?? "").trim();
  if (value === "") return "unverified";
  const tier = TRUST_TIERS.find((t) => t === value);
  if (tier === undefined) {
    throw new TrustFloorError(
      `KSOR_MIN_TRUST_TIER is ${JSON.stringify(value)}, which is not a trust tier\n` +
        "  why: the floor decides which half of the record this door may answer from, so an " +
        'unrecognised value cannot be read as "no floor" — that would serve everything the ' +
        "operator meant to hold back\n" +
        `  fix: use one of ${TRUST_TIERS.join(", ")}, or unset it for ${TRUST_TIERS[0]}`,
    );
  }
  return tier;
}
