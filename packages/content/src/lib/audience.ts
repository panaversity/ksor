/**
 * The audience seam: which documents a VIEWER may be served (record spec §2.4).
 *
 * A concept holds a LIST of audience identifiers (`ksor.audience`); a viewer
 * holds a list that always includes `public`; the concept is visible when the
 * two overlap — `n.audience && :viewer`. Rank moved to the viewer and
 * membership stayed on the document, which is what let every row of the old
 * ranked table keep its meaning (`AUDIENCE_CASES` is the rule;
 * `audience-conformance.db.test.ts` runs the predicate against every row
 * through real Postgres).
 *
 * This is ONE of three predicates, not the whole admission decision:
 * `lib/admit.ts` composes it with `lib/lifecycle.ts` and `lib/trust.ts` into
 * the set that search, read, outline and the calibration sampler bind, the way
 * `lib/takedown.ts` binds denial. Bind THAT, not this — a path that overlapped
 * audience alone would serve drafts and expired documents to the right people.
 *
 * A SECTION is not decided here. Ingest gives it the union of its descendants'
 * lists, which is enough for audience and for nothing else — a section whose
 * every document is a draft or past its review date would still carry their
 * lists — so admission resolves it by a descendant walk instead (`admit.ts`).
 * The union stays on the row because it is what the site's own tree reads.
 *
 * Omission is a refusal upstream (the checker), never a default here: a NULL
 * or empty list overlaps nothing and is served to nobody.
 */

export type ViewerRefusal =
  | "ksor-viewer-omits-public"
  | "ksor-viewer-unregistered"
  | "ksor-audience-identifier-invalid";

/**
 * A refusal about WHO this door serves.
 *
 * Same two-audience shape as `GovernanceGateError`, for the same reason: the
 * OPERATOR needs to see what the record actually registers, and a CALLER — who
 * under `KSOR_AUTH=disabled-public` is anyone who can reach the port — does not
 * need the record's audience vocabulary read out to them because the operator
 * mistyped an environment variable. The names of a record's audiences are its
 * governance structure, not a public fact about it.
 *
 * So `registered` arrives through its own parameter and lands on `message`
 * alone; `wire` is the text this constructor was handed. The viewer list itself
 * is NOT record content — it is the operator's own env — and stays in both.
 */
export class AudienceError extends Error {
  override readonly name: string = "AudienceError";
  readonly slug: ViewerRefusal;
  /** The refusal minus the record's own audience registry. */
  readonly wire: string;

  constructor(slug: ViewerRefusal, wire: string, registered: readonly string[] | null = null) {
    const text = `${slug}: ${wire}`;
    super(
      registered === null
        ? text
        : // "none registered" is not padding: it separates a record with no
          // policy row from one whose policy simply lacks this entry, which are
          // different fixes.
          `${text}\n  this record registers, for your logs: ${
            registered.length === 0 ? "(none registered)" : registered.join(", ")
          }`,
    );
    this.slug = slug;
    this.wire = text;
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
  // Before anything else: an identifier that cannot survive the encoding is not
  // a narrower or wider viewer, it is a DIFFERENT one (see assertEncodable).
  for (const id of viewer) assertEncodable(id);
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
      `the viewer list names ${unknown.map((u) => `\`${u}\``).join(", ")}, which this record's audience registry does not declare — serving an unknown identifier would have to guess how much of the record it may show\n` +
        "  fix: use registered audiences, or register it in .ksor/governance.yaml and re-ingest",
      registry,
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
 * pool borrower.
 *
 * The alias parameter is vestigial — it existed because the outline's
 * child_count subquery scanned a second alias, which `admittedCte` now covers,
 * and every remaining caller passes `"n"`. It is kept rather than inlined
 * because the string this produces is hashed into `GATE_PREDICATE_DIGEST` and
 * pinned by value in `calibration-digest.test.ts`: collapsing it must not move
 * a byte, and there is nothing to gain by finding out.
 */
export function audienceAllowed(alias: string): string {
  return `(
    current_setting('app.viewer', true) = '${WHOLE_RECORD}'
    OR ${alias}.audience && string_to_array(current_setting('app.viewer', true), E'\\x1f')
)`;
}

/** The predicate for the usual `n` alias. */
export const AUDIENCE_ALLOWED: string = audienceAllowed("n");

/**
 * The two things an audience identifier may not be, enforced where identifiers
 * ENTER the encoding rather than only where the door validates them.
 *
 * The separator was documented as "chosen because no audience identifier may
 * contain it" and nothing checked. It is not a style rule: `audienceGucs` joins
 * on U+001F and the SQL splits on it, so `intern\x1fboard` does not travel as
 * one identifier — it arrives as TWO, and the viewer holds an audience nobody
 * granted. The sentinel is the same class: `*` is the value the predicate
 * compares against for "the whole record", so an identifier spelled `*` is a
 * name that means everything to the reader of the GUC.
 *
 * Both are refusals rather than escapes. An escape would make the two sides
 * agree while leaving a governance identifier that reads one way in
 * `.ksor/governance.yaml` and another in the database — and a registry is a
 * short list a human wrote, so nothing legitimate is being turned away.
 */
function assertEncodable(id: string): void {
  const bad = id.includes(SEP) ? "the unit separator U+001F" : id === WHOLE_RECORD ? "`*`" : null;
  if (bad === null) return;
  throw new AudienceError(
    "ksor-audience-identifier-invalid",
    `the audience identifier ${JSON.stringify(id)} contains ${bad}, which this record cannot carry — the viewer list is joined on U+001F and split on it in SQL, and \`*\` is the sentinel meaning the WHOLE record, so either one is read as a different set of audiences than the one written\n` +
      "  fix: name audiences in plain words (letters, digits, `-`, `_`) in .ksor/governance.yaml and in KSOR_AUDIENCE",
  );
}

/** The GUC {@link AUDIENCE_ALLOWED} reads, for a validated viewer list. */
export function audienceGucs(viewer: readonly string[]): Readonly<Record<string, string>> {
  for (const id of viewer) assertEncodable(id);
  return { "app.viewer": viewer.join(SEP) };
}

/** The scope for a caller entitled to the WHOLE record. */
export const WHOLE_RECORD_SCOPE: Readonly<Record<string, string>> = { "app.viewer": WHOLE_RECORD };
