/**
 * The governance a document declares about itself, carried onto the record.
 *
 * ONE reader (decision 26): the profile schema in `record/profile.ts` reads a
 * concept's frontmatter, and this module only projects a parsed `Concept` into
 * the shape the manifest carries and `content_nodes` stores (schema 2.5). The
 * hand-rolled five-key reader this file used to be — and the line scanner
 * beside it — are gone; a second reader is how the visibility leak found its
 * doors.
 */

import type { Concept, TrustTier } from "../record/profile.js";
import { TRUST_TIERS } from "../record/profile.js";

export interface Act {
  readonly by: string;
  /** ISO 8601 instant, as authored. */
  readonly at: string;
}

/** What the record carries. `null` means "the document said nothing" — legal only where the profile makes the key optional. */
export interface NodeGovernance {
  /** `ksor.audience`; a section carries the union of its descendants' lists. */
  readonly audience: readonly string[] | null;
  /** The authored lifecycle status — draft / stable / deprecated. NOT the row's serving status. */
  readonly docStatus: "draft" | "stable" | "deprecated" | null;
  readonly owner: string | null;
  readonly sources: readonly Readonly<Record<string, unknown>>[] | null;
  readonly verified: readonly Act[] | null;
  readonly generated: { readonly by: string; readonly at: string | null } | null;
  readonly approval: Act | null;
  readonly deprecated: Act | null;
  readonly effectiveFrom: string | null;
  readonly staleAfter: string | null;
  /** 0 unverified · 1 machine-confirmed · 2 human-reviewed; derived, never authored. */
  readonly trustTier: 0 | 1 | 2 | null;
  /** stable_id (`knowledge/<id>`) of the document that replaces this one. */
  readonly supersededBy: string | null;
}

export const NO_GOVERNANCE: NodeGovernance = {
  audience: null,
  docStatus: null,
  owner: null,
  sources: null,
  verified: null,
  generated: null,
  approval: null,
  deprecated: null,
  effectiveFrom: null,
  staleAfter: null,
  trustTier: null,
  supersededBy: null,
};

export function trustTierNumber(tier: TrustTier): 0 | 1 | 2 {
  const index = TRUST_TIERS.indexOf(tier);
  // `indexOf(...) as 0 | 1 | 2` returned -1 for a tier the vocabulary does not
  // hold, wearing a type that says it cannot — and -1 lands in
  // `content_nodes.trust_tier` as a number below the floor, which no reader
  // interprets and no query filters on. The tier is derived, never authored,
  // so an unknown one is a bug upstream rather than a value to store.
  if (index === -1) {
    throw new Error(
      `unknown trust tier ${JSON.stringify(tier)} — expected ${TRUST_TIERS.join(" | ")}`,
    );
  }
  return index as 0 | 1 | 2;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const act = (a: { readonly by: string; readonly at: number } | null): Act | null =>
  a === null ? null : { by: a.by, at: new Date(a.at).toISOString() };

/**
 * `generated.by` as the document declared it, or null when it declared no
 * mapping at all.
 *
 * The profile requires `by` to be an actor, so a mapping without one cannot
 * reach here through `parseConcept` — but `governanceOf` takes a `Concept`,
 * which is an interface, and what the projection used to write in that state
 * was `String(undefined)`: a producer named `undefined`, on the column that
 * records WHO (decision 21). Fabricating an attributor is worse than stopping,
 * and dropping the key silently would report an absence the document did not
 * declare, so the unattributable mapping refuses out loud.
 */
function generatedBy(concept: Concept): string | null {
  const generated = concept.frontmatter["generated"];
  if (typeof generated !== "object" || generated === null) return null;
  const by = (generated as Record<string, unknown>)["by"];
  if (typeof by === "string") return by;
  throw new Error(
    `${concept.path}: \`generated.by\` is ${by === undefined ? "absent" : typeof by}, not an actor — the profile refuses this, so the concept did not come through it`,
  );
}

/** The projection of a parsed concept — the frontmatter the profile validated, nothing re-read. */
export function governanceOf(concept: Concept): NodeGovernance {
  const fm = concept.frontmatter;
  const by = generatedBy(concept);
  const sources = fm["sources"];
  return {
    audience: [...concept.audience],
    docStatus: concept.status,
    owner: concept.owner,
    sources: Array.isArray(sources) ? (sources as Readonly<Record<string, unknown>>[]) : null,
    verified: concept.verified.length === 0 ? null : concept.verified.map((v) => act(v)!),
    generated: by === null ? null : { by, at: iso(concept.generatedAt) },
    approval: act(concept.approval),
    deprecated: act(concept.deprecated),
    effectiveFrom: iso(concept.effectiveFrom),
    staleAfter: iso(concept.staleAfter),
    trustTier: trustTierNumber(concept.trustTier),
    supersededBy: concept.supersededBy === null ? null : `knowledge/${concept.supersededBy}`,
  };
}

/** A section's governance: no status, no tier — only the audiences its descendants reach. */
export function sectionGovernance(
  descendantAudiences: readonly (readonly string[])[],
): NodeGovernance {
  const union = new Set<string>();
  for (const list of descendantAudiences) for (const a of list) union.add(a);
  return { ...NO_GOVERNANCE, audience: [...union].sort() };
}
