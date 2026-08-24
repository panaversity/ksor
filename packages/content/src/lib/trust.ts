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
