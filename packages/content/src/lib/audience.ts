/**
 * The audience seam: which documents a VIEWER may be served (record spec §2.4).
 *
 * A concept holds a LIST of audience identifiers (`ksor.audience`); a viewer
 * holds a list that always includes `public`; the concept is visible when the
 * two overlap — `n.audience && :viewer`, one predicate bound into search, read,
 * outline and the calibration sampler the way `lib/takedown.ts` binds denial.
 * Rank moved to the viewer and membership stayed on the document, which is what
 * let every row of the old ranked table keep its meaning (`OVERLAP_CASES` is
 * the rule; `audience-conformance.db.test.ts` runs the predicate against every
 * row through real Postgres).
 *
 * Sections carry the UNION of their descendants' lists at ingest, so the same
 * predicate admits a section iff a descendant is visible — no second branch.
 *
 * Omission is a refusal upstream (the checker), never a default here: a NULL
 * or empty list overlaps nothing and is served to nobody.
 */

export type ViewerRefusal = "ksor-viewer-omits-public" | "ksor-viewer-unregistered";

export class AudienceError extends Error {
  override readonly name: string = "AudienceError";
  readonly slug: ViewerRefusal;
  constructor(slug: ViewerRefusal, message: string) {
    super(`${slug}: ${message}`);
    this.slug = slug;
  }
}

/** `KSOR_AUDIENCE` is a comma list; unset or empty means `[public]` (build spec §3). */
export function parseViewer(raw: string | undefined | null): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  return list.length === 0 ? ["public"] : [...new Set(list)];
}

/**
 * The viewer list this door serves, validated against the policy's registry
 * (`public` is reserved and never registered). A list that omits `public` or
 * names an identifier no policy declares is refused at boot, never narrowed or
 * widened silently.
 */
export function validateViewer(registry: readonly string[], viewer: readonly string[]): string[] {
  if (!viewer.includes("public")) {
    throw new AudienceError(
      "ksor-viewer-omits-public",
      `the viewer list [${viewer.join(", ")}] omits \`public\` — every viewer holds the unrestricted audience, so a list without it would hide the public half of the record\n` +
        "  fix: KSOR_AUDIENCE is a comma list that includes public, e.g. KSOR_AUDIENCE=public,internal",
    );
  }
  const unknown = viewer.filter((v) => v !== "public" && !registry.includes(v));
  if (unknown.length > 0) {
    throw new AudienceError(
      "ksor-viewer-unregistered",
      `the viewer list names ${unknown.map((u) => `\`${u}\``).join(", ")}, which the policy's registry (${registry.length === 0 ? "none registered" : registry.join(", ")}) does not declare — serving an unknown identifier would have to guess how much of the record it may show\n` +
        "  fix: use registered audiences, or register it in .ksor/governance.yaml and re-ingest",
    );
  }
  return [...viewer];
}

/**
 * The sentinel for "the whole record" — calibration (the floor is a property of
 * the corpus), ingest-side verification, and tests. A VALUE, so "everything" is
 * something a caller says rather than what happens when nobody binds a scope:
 * an UNBOUND `app.viewer` overlaps nothing and the predicate is false.
 */
const WHOLE_RECORD = "*";

/** The unit separator, chosen because no audience identifier may contain it. */
const SEP = "";

/**
 * The serving-path predicate for a node aliased `alias`, written against a
 * transaction GUC rather than a positional parameter: the retrieval statements
 * share one `ARM_WHERE` string and renumber its parameters by substitution, so
 * a GUC composes the way the tenant wall does — bound in the same `set_config`
 * round trip, invisible to the numbering, and impossible to leak to the next
 * pool borrower. Parameterised by alias because the outline's child_count
 * subquery scans a second one; two hand copies drifted apart once (PR #43).
 */
export function audienceAllowed(alias: string): string {
  return `(
    current_setting('app.viewer', true) = '${WHOLE_RECORD}'
    OR ${alias}.audience && string_to_array(current_setting('app.viewer', true), E'\\x1f')
)`;
}

/** The predicate for the usual `n` alias. */
export const AUDIENCE_ALLOWED: string = audienceAllowed("n");

/** The GUC {@link AUDIENCE_ALLOWED} reads, for a validated viewer list. */
export function audienceGucs(viewer: readonly string[]): Readonly<Record<string, string>> {
  return { "app.viewer": viewer.join(SEP) };
}

/** The scope for a caller entitled to the WHOLE record. */
export const WHOLE_RECORD_SCOPE: Readonly<Record<string, string>> = { "app.viewer": WHOLE_RECORD };
