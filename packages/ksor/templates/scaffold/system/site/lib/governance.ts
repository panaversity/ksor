// What the record says about a document, projected for rendering.
//
// `knowledge/` documents carry a governance vocabulary that `pnpm check`
// enforces — status, owner, provenance, effective, superseded_by — and until
// this module existed the site parsed four of those keys and threw them away.
// Provenance is load-bearing: a reader has to be able to see who stands behind
// a document and where it came from, or the site is showing them prose while
// the agent surface answers with citations.
//
// Import-free on purpose: this is the pure half, so it is unit-tested directly
// (packages/ksor/src/site-governance.test.ts) without a site install. Anything
// needing the Fumadocs loader — resolving a successor pointer to its route —
// lives outside it.
//
// Contract: specs/ksor/site-governance/spec.md

export interface DocumentGovernance {
  /** `draft` | `review` | `approved` | `superseded`. Required by the checker; null only when a document skipped it. */
  readonly status: string | null;
  /** Who stands behind this document. */
  readonly owner: string | null;
  /** One entry per source — a citation must be able to point at exactly one of them. */
  readonly provenance: readonly string[];
  /** When it took effect, as an ISO date. */
  readonly effective: string | null;
  /** The successor's pointer as the document declares it, e.g. `./refund-policy-v5.md`. */
  readonly supersededBy: string | null;
}

/**
 * A declared value, or null. Blank and whitespace-only count as undeclared: a
 * key an author started and left empty is not a governance fact.
 *
 * An unquoted `effective: 2026-04-01` parses to a Date, so dates normalize to
 * their ISO day here — rendering the object would print a locale- and
 * timezone-dependent string into the record.
 */
function declared(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : (value.toISOString().split("T")[0] ?? null);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The document's governance, exactly as it declares it.
 *
 * Nothing is inferred, defaulted or synthesized — an undeclared key yields
 * null and renders nothing. A placeholder ("unknown", "none") would read as
 * governed, which is worse than a gap the reader can see.
 *
 * `where` names the document in the one error this can raise.
 */
export function readGovernance(
  data: Readonly<Record<string, unknown>>,
  where: string,
): DocumentGovernance {
  const status = declared(data["status"]);
  const supersededBy = declared(data["superseded_by"]);

  // Defense in depth: `pnpm check` refuses this, so reaching it means the
  // adopter skipped the checker. Failing the build is the honest outcome —
  // the alternative is serving a document that says it was replaced and
  // cannot say by what.
  if (status === "superseded" && supersededBy === null) {
    throw new Error(
      `${where} is status: superseded with no superseded_by — a document that says it was ` +
        "replaced must say by what, or the reader is told to stop trusting it and given nowhere " +
        "to go. Add superseded_by: ./<successor>.md (pnpm check refuses this too).",
    );
  }

  // A scalar provenance is a checker finding, not a crash: turning one into an
  // unexplained build failure hides the real message `pnpm check` would print.
  const raw: unknown = data["provenance"];
  const provenance = Array.isArray(raw)
    ? raw.map(declared).filter((entry): entry is string => entry !== null)
    : [];

  return {
    status,
    owner: declared(data["owner"]),
    provenance,
    effective: declared(data["effective"]),
    supersededBy,
  };
}
