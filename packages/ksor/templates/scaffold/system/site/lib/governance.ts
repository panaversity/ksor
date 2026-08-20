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
export function readGovernance(data: unknown, where: string): DocumentGovernance {
  // `unknown` rather than the loader's page-data type: the projection reads
  // frontmatter, which is whatever the author wrote, and a shell that crashes
  // on a shape the checker would have named is worse than one that renders
  // what it can.
  const record: Record<string, unknown> =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};

  const status = declared(record["status"]);
  const supersededBy = declared(record["superseded_by"]);

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
  const raw: unknown = record["provenance"];
  const provenance = Array.isArray(raw)
    ? raw.map(declared).filter((entry): entry is string => entry !== null)
    : [];

  return {
    status,
    owner: declared(record["owner"]),
    provenance,
    effective: declared(record["effective"]),
    supersededBy,
  };
}

/** Resolve a `./successor.md` pointer against a base route. */
function joinRoute(base: string, relative: string): string {
  const segments = base.split("/").filter((segment) => segment !== "");
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  // knowledge/legal/index.md renders at /docs/legal — the folder's own route.
  if (segments[segments.length - 1] === "index") segments.pop();
  return `/${segments.join("/")}`;
}

/**
 * The route a `superseded_by` pointer names, or null.
 *
 * `pnpm check` has already proved the pointer resolves to a real document
 * inside `knowledge/`, so a null here means OUR arithmetic disagreed with the
 * loader — and the honest answer is to render the pointer as text. A dead link
 * on a supersession notice is the worst of both: it says stop trusting this,
 * and then strands the reader.
 *
 * A route cannot say whether `/docs/legal` came from `legal.md` or from
 * `legal/index.md`, and the two give different meanings to `./terms.md`. Both
 * readings are resolved and one must survive: an ambiguous pointer (both
 * readings name real pages) yields null rather than a coin-flip link.
 */
export function resolveSuccessorUrl(
  pointer: string,
  currentUrl: string,
  knownUrls: readonly string[],
): string | null {
  // Leaves the record: an absolute URL or a site-absolute path is not a
  // pointer into knowledge/ at all.
  if (pointer.includes("://") || pointer.startsWith("/")) return null;

  const [target = "", anchor] = pointer.split("#", 2);
  if (!target.endsWith(".md")) return null;
  const withoutExtension = target.slice(0, -".md".length);

  const asPage = currentUrl.split("/").slice(0, -1).join("/");
  const readings = [joinRoute(asPage, withoutExtension), joinRoute(currentUrl, withoutExtension)];

  const known = new Set(knownUrls);
  const resolved = [...new Set(readings)].filter((route) => known.has(route));
  if (resolved.length !== 1) return null;

  const route = resolved[0] ?? "";
  return anchor === undefined ? route : `${route}#${anchor}`;
}

/**
 * Whether this record's site shows the governance it declares — the
 * `site.governance` key in instance.md, default **on**:
 *
 *     site:
 *       governance: false
 *
 * The record often wants `owner:` and `provenance:` filled in for the agent
 * surface and the audit trail while the published page stays plain. That is a
 * publication choice, so it belongs to the instance, not to each document —
 * per-document control is already the frontmatter itself (declare a key and it
 * shows; leave it off and nothing does).
 *
 * Default on, and additive: every record written before this key existed keeps
 * rendering exactly as it did. Turning it off never hides the SUPERSESSION
 * notice — that is a correctness warning, not decoration, and a reader handed a
 * replaced document with no word of its successor has been misled.
 *
 * Takes the frontmatter block (not a path) so it stays pure and testable; the
 * site binds it once in lib/shared.ts.
 */
export function governanceVisible(instanceFrontmatterBlock: string): boolean {
  const lines = instanceFrontmatterBlock.split("\n");
  const start = lines.findIndex((line) => /^site:[ \t]*(?:#.*)?$/.test(line));
  if (start === -1) return true;

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    // A non-indented line ends the block: a TOP-LEVEL `governance:` is a
    // different key and must never be mistaken for this setting.
    if (!/^[ \t]/.test(line)) break;
    const match = /^[ \t]+governance:[ \t]*(.*)$/.exec(line);
    if (match === null) continue;

    const raw = (match[1] ?? "").trim();
    // ` #` starts a YAML comment on an unquoted value (the grammar the
    // audience model already follows).
    const value = (/^["']/.test(raw) ? raw : raw.replace(/\s+#.*$/, ""))
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .toLowerCase();

    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(
      `instance.md site.governance is ${JSON.stringify(raw)} — it must be true or false. ` +
        "Defaulting silently would publish the governance you asked to hide, or hide what you " +
        "asked to publish. Write `governance: false` to keep the pages plain, or remove the key.",
    );
  }
  return true;
}
