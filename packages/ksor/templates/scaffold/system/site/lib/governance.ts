// What the record says about a document, projected for rendering.
//
// A concept carries the profile's governance (record spec §2) — status, type,
// `ksor.owner`, `sources`, `ksor.effective_from`, `stale_after`,
// `ksor.superseded_by`, the approval and the verifications — and this module
// is the one projection of those keys the pages and the agent surfaces share.
// Provenance is load-bearing: a reader has to be able to see who stands behind
// a document and where it came from, or the site is showing them prose while
// the agent surface answers with citations.
//
// Free of VALUE imports on purpose: this is the pure half, so it is unit-tested
// directly (packages/ksor/src/site-governance.test.ts) without a site install.
// Anything needing the Fumadocs loader — resolving a successor to its route —
// lives outside it.
//
// The one import is a TYPE, and it alone carries the `.js` that the package's
// Node-ESM program wants, while every other module here is extensionless
// because Turbopack resolves neither form onto a `.ts` file. `import type` is
// erased before any bundler sees it, so the two rules never meet on this line.

import type { LifecycleBadge } from "./lifecycle-rule.js";

export interface Source {
  readonly id: string | null;
  readonly title: string | null;
  /** A URL, a bundle path, or a scope descriptor (OKF §5.1). */
  readonly resource: string;
}

export interface Act {
  readonly by: string;
  /** The instant as the record wrote it. */
  readonly at: string;
}

export interface DocumentGovernance {
  /** `draft` | `stable` | `deprecated` (record spec §2.2). Null only when a document skipped it. */
  readonly status: string | null;
  readonly type: string | null;
  /** Who stands behind this document: `ksor.owner`. */
  readonly owner: string | null;
  /** One entry per source — a citation must be able to point at exactly one of them. */
  readonly sources: readonly Source[];
  /** `ksor.effective_from`, as the record wrote it. */
  readonly effectiveFrom: string | null;
  readonly staleAfter: string | null;
  /** The successor's concept id, e.g. `policies/purchase-approval-v2`. */
  readonly supersededBy: string | null;
  readonly approval: Act | null;
  readonly deprecated: Act | null;
  readonly verified: readonly Act[];
}

/**
 * A declared scalar, or null. Blank and whitespace-only count as undeclared: a
 * key an author started and left empty is not a governance fact.
 *
 * An unquoted instant parses to a Date in the collection's YAML, so dates
 * normalize to ISO here — rendering the object would print a locale- and
 * timezone-dependent string into the record.
 */
function declared(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function mapping(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function act(value: unknown): Act | null {
  const m = mapping(value);
  const by = declared(m["by"]);
  const at = declared(m["at"]);
  return by === null || at === null ? null : { by, at };
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
  const record = mapping(data);
  const ksor = mapping(record["ksor"]);

  const status = declared(record["status"]);
  const supersededBy = declared(ksor["superseded_by"]);

  // Defense in depth: the checker refuses a deprecated concept with no
  // attribution. Failing the build is the honest outcome — the alternative is
  // serving a document that says it was withdrawn and cannot say who did it.
  if (status === "deprecated" && act(ksor["deprecated"]) === null) {
    throw new Error(
      `${where} is status: deprecated with no ksor.deprecated — a document the record withdrew ` +
        "must say who withdrew it and when, or the reader is told to stop trusting it by nobody. " +
        "Add ksor.deprecated: { by, at } (pnpm check refuses this too).",
    );
  }

  // A malformed sources list is a checker finding, not a crash: turning one
  // into an unexplained build failure hides the real message `pnpm check` prints.
  const raw: unknown = record["sources"];
  const sources = Array.isArray(raw)
    ? raw.flatMap((entry): Source[] => {
        const m = mapping(entry);
        const resource = declared(m["resource"]);
        return resource === null
          ? []
          : [{ id: declared(m["id"]), title: declared(m["title"]), resource }];
      })
    : [];
  // OKF §5.2: a bare `verified` mapping is a one-element list.
  const verifiedRaw: unknown = record["verified"];
  const verified = (Array.isArray(verifiedRaw) ? verifiedRaw : [verifiedRaw])
    .map(act)
    .filter((entry): entry is Act => entry !== null);

  return {
    status,
    type: declared(record["type"]),
    owner: declared(ksor["owner"]),
    sources,
    effectiveFrom: declared(ksor["effective_from"]),
    staleAfter: declared(record["stale_after"]),
    supersededBy,
    approval: act(ksor["approval"]),
    deprecated: act(ksor["deprecated"]),
    verified,
  };
}

/** The three tiers, in the order OKF ranks them. */
export type TrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

/** Trust tier derives from `verified` (record spec §2.3): none, machine only, or any human. */
export function trustTierOf(verified: readonly Act[]): TrustTier {
  if (verified.length === 0) return "unverified";
  return verified.some((v) => v.by.startsWith("human:")) ? "human-reviewed" : "machine-confirmed";
}

/** The tier, and the verification that put the document there. */
export interface TrustSignal {
  readonly tier: TrustTier;
  /** Null at `unverified`, where by definition nobody has said anything. */
  readonly by: string | null;
  readonly at: string | null;
}

/**
 * The tier a page shows, WITH its verifier — "human-reviewed" alone is a claim
 * with nobody behind it, and provenance is load-bearing.
 *
 * The verification named is the latest one OF THE KIND THAT SET THE TIER: the
 * tier keys on the `human:` prefix (record spec §2.3), so a nightly machine
 * pass running after a human review must not end up credited with the review.
 * A tier is never inferred from anything but `verified`, and `unverified` is
 * the honest state a stable, approved, unreviewed concept sits at — reported,
 * not hidden (research/okf-native.md §1.1).
 */
export function trustSignal(verified: readonly Act[]): TrustSignal {
  const tier = trustTierOf(verified);
  if (tier === "unverified") return { tier, by: null, at: null };
  const deciding =
    tier === "human-reviewed" ? verified.filter((v) => v.by.startsWith("human:")) : verified;
  // Latest by instant; an unparsable `at` (which the checker refuses) keeps
  // declaration order rather than crashing the page it was handed.
  let latest = deciding[0] as Act;
  for (const entry of deciding.slice(1)) {
    const a = Date.parse(entry.at);
    const b = Date.parse(latest.at);
    if (!Number.isNaN(a) && (Number.isNaN(b) || a >= b)) latest = entry;
  }
  return { tier, by: latest.by, at: latest.at };
}

/** One document as the loader reports it: its source path, and its route. */
export interface RecordPage {
  /** Path under `knowledge/`, e.g. `legal.md` or `policies/terms.md`. */
  readonly path: string;
  /** The route it renders at, e.g. `/docs/legal`. */
  readonly url: string;
}

/** The concept id of a page: its path without `.md`, forward slashes. */
export function conceptIdOfPath(pagePath: string): string {
  return pagePath.replaceAll("\\", "/").replace(/\.mdx?$/, "");
}

/**
 * The route a `ksor.superseded_by` pointer names, or null.
 *
 * The pointer is a CONCEPT ID — bundle-relative, `.md` optional (record spec
 * §2, `ksor.superseded_by: policies/purchase-approval-v2`) — resolved against
 * the pages in THIS build. Null means the successor is not here: legitimate
 * for a per-viewer build, which stages a subset, and the caller then shows the
 * pointer as text. A dead link on a deprecation notice is the worst outcome:
 * it tells the reader to stop trusting the page and then strands them.
 */
export function resolveSuccessorUrl(pointer: string, pages: readonly RecordPage[]): string | null {
  if (pointer.includes("://") || pointer.startsWith("/") || pointer.startsWith(".")) return null;
  const [target = "", anchor] = pointer.split("#", 2);
  const id = target.replace(/\.md$/, "");
  const match = pages.find((page) => conceptIdOfPath(page.path) === id);
  if (match === undefined) return null;
  return anchor === undefined ? match.url : `${match.url}#${anchor}`;
}

/**
 * Whether a string is a real day on the calendar, not merely date-SHAPED.
 *
 * `2026-06-31` and `2026-13-45` both match a `\d{4}-\d{2}-\d{2}` shape, and
 * stamping either into `<time datetime>` publishes a day that does not exist:
 * invalid HTML, and a consumer parsing it gets July 1st.
 */
export function isCalendarDate(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (parts === null) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** The calendar day of an instant, for a reader: `2026-09-01T00:00:00Z` → `2026-09-01`. */
export function dayOf(instant: string): string {
  return instant.split("T")[0] ?? instant;
}

/**
 * Whether this record's site shows the governance it declares — the
 * `site.governance` key in instance.md, default **on**:
 *
 *     site:
 *       governance: false
 *
 * The record often wants owners and sources filled in for the agent surface
 * and the audit trail while the published page stays plain. That is a
 * publication choice, so it belongs to the instance, not to each document —
 * per-document control is already the frontmatter itself (declare a key and it
 * shows; leave it off and nothing does).
 *
 * Default on, and additive: every record written before this key existed keeps
 * rendering exactly as it did. Turning it off never hides the DEPRECATION
 * notice — that is a correctness warning, not decoration, and a reader handed a
 * replaced document with no word of its successor has been misled.
 *
 * Takes the parsed instance frontmatter (not a path) so it stays pure and
 * testable; the site binds it once in lib/shared.ts. Real YAML now, so a flow
 * mapping and a block read the same — the line scanner this replaced had to
 * refuse the flow form because it could not read it.
 */
export function governanceVisible(instance: Readonly<Record<string, unknown>>): boolean {
  const site = instance["site"];
  if (typeof site !== "object" || site === null || Array.isArray(site)) return true;
  const value = (site as Record<string, unknown>)["governance"];
  if (value === undefined || value === null) return true;
  if (typeof value === "boolean") return value;
  throw new Error(
    `instance.md site.governance is ${JSON.stringify(value)} — it must be true or false. ` +
      "Defaulting silently would publish the governance you asked to hide, or hide what you " +
      "asked to publish. Write `governance: false` to keep the pages plain, or remove the key.",
  );
}

// ---------------------------------------------------------------------------
// The badge: what a human surface says beside a document the machine surfaces
// decline (record spec §2.5). ONE vocabulary for the page chip, the sidebar,
// the listings and the search results, so a reader picking between a document
// and its successor sees the same word everywhere.

/**
 * The chip text for a badge, or null for a document every surface admits.
 *
 * The words are record spec §2.5's own — "effective from …" and "past its
 * review date" — because the reader who meets one on a sidebar row and again
 * on the page must not have to work out that two phrasings mean one state.
 * §2.5's ellipsis is the date, and `badgeText` fills it in where there is
 * room; this is the same sentence with the value left off, never a second one.
 */
export function badgeLabel(badge: LifecycleBadge | null): string | null {
  switch (badge) {
    case null:
      return null;
    case "draft":
      return "draft";
    case "deprecated":
      return "deprecated";
    case "effective-from":
      return "effective from";
    case "stale":
      return "past its review date";
  }
}

/**
 * The badge as a PAGE says it: §2.5's words with the ellipsis filled in from
 * the document's own `ksor.effective_from`.
 *
 * Only `effective-from` carries a date, and only forwards: "past its review
 * date" is about a day that has gone, and the day itself is already a fact in
 * the strip beside it ("Review by"), so repeating it in the chip would say the
 * same thing twice in one line.
 */
export function badgeText(
  badge: LifecycleBadge | null,
  effectiveFrom: string | null,
): string | null {
  const label = badgeLabel(badge);
  if (label === null) return null;
  if (badge !== "effective-from" || effectiveFrom === null) return label;
  return `${label} ${dayOf(effectiveFrom)}`;
}

/**
 * Does the badge say anything the status chip does not?
 *
 * `draft` and `deprecated` are both a status word and a badge word, so a page
 * that drew both would print one state twice. The two date states have no
 * status word of their own — the document is `stable` and something about the
 * calendar keeps it off the machine surfaces — and those are exactly the ones
 * a reader cannot infer from the status alone.
 */
export function badgeAddsToStatus(badge: LifecycleBadge | null, status: string | null): boolean {
  return badge !== null && badge !== status;
}

/** The three lifecycle states (record spec §2.2), and nothing else — a word the record does not define is not a status. */
const STATUSES: readonly string[] = ["draft", "stable", "deprecated"];

/**
 * The status chip every page carries — including a `stable` one, which is the
 * one difference from the badge.
 *
 * A badge is rare on purpose: it marks the documents the machine surfaces
 * decline. The status is not a caveat, it is the record's own word for where
 * the document stands, and research/okf-native.md §1.1 has the page saying it
 * out loud from day one — "the chips say `stable` with approver and date, and
 * the badge says unverified". A reader who cannot see `stable` cannot tell a
 * governed record from a site that simply never said.
 */
export function statusLabel(status: string | null): string | null {
  return status !== null && STATUSES.includes(status) ? status : null;
}

/** The status chip's tone — the same rule the badge uses, so one state is one colour. */
export function statusTone(status: string | null): string {
  return status === "deprecated" ? "ksor-withdrawn" : "";
}

/**
 * The tone class a badge wears. Only a WITHDRAWN document gets a colour:
 * `draft` and the two date states are ordinary states of a live document;
 * `deprecated` says the record has replaced it, and that is the one chip a
 * reader must not mistake for the others at the moment of choosing.
 */
export function badgeTone(badge: LifecycleBadge | null): string {
  return badge === "deprecated" ? "ksor-withdrawn" : "";
}

// ---------------------------------------------------------------------------
// The AGENT surface's projection of the same record.
//
// The machine surfaces admit only stable, effective, unexpired concepts, so a
// consumer never meets a deprecated or draft document there — what it needs is
// the governance that makes the passage citable, and the stamps that connect
// it to one publication (R14). Deliberately NOT gated on `site.governance`:
// that key decides what the PAGES publish; the record keeps every key for the
// agent surface and the audit trail.

/** The stamps every machine artefact carries (build spec §3). */
export interface Stamps {
  readonly build_id: string | null;
  readonly source_commit: string | null;
  readonly dirty: boolean;
  readonly ksor_version: string | null;
  readonly unstamped: boolean;
}

/**
 * A YAML scalar a consumer can parse back to exactly what the record said. The
 * shapes below are the ones a plain scalar cannot carry: unquoted, YAML reads
 * them as something else.
 */
function yamlScalar(value: string): string {
  const risky =
    value.includes(": ") ||
    value.endsWith(":") ||
    value.includes(" #") ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    value !== value.trim();
  return risky ? JSON.stringify(value) : value;
}

/** The stamp lines, as YAML keys — one spelling for every artefact. */
export function stampLines(stamps: Stamps): string[] {
  if (stamps.unstamped) return ["build_id: null", "unstamped: true"];
  const lines = [`build_id: ${yamlScalar(stamps.build_id ?? "")}`];
  if (stamps.source_commit !== null)
    lines.push(`source_commit: ${yamlScalar(stamps.source_commit)}`);
  if (stamps.dirty) lines.push("dirty: true");
  if (stamps.ksor_version !== null) lines.push(`ksor_version: ${yamlScalar(stamps.ksor_version)}`);
  return lines;
}

/**
 * The frontmatter a document's markdown twin and its `llms-full.txt` block
 * carry: the record's OWN frontmatter, intact, then the derived trust tier and
 * the build's stamps (R14).
 *
 * `raw` is the concept's frontmatter exactly as the staged file holds it,
 * between its fences and unparsed. Intact, because the twin is the record's
 * bytes: an OKF consumer that fetches one must be able to parse the concept the
 * profile describes, and record spec §2.7 keeps unknown keys for exactly that
 * reason — a re-serialisation drops whatever this shell did not think to
 * project.
 *
 * The projection this replaced flattened `ksor.owner` into a top-level `owner:`
 * and `ksor.effective_from` into `effective_from:`. Both are keys record spec
 * §2.7 refuses BY NAME as pre-profile leftovers, so every twin published a
 * frontmatter the record's own checker would have rejected — the corpus
 * describing itself in a grammar it forbids (found while implementing build
 * spec §3's twin clause).
 *
 * Two keys are ADDED rather than copied, and both are the build speaking about
 * the document rather than the document speaking about itself: `trust_tier`,
 * which record spec §2.3 derives from `verified` and no reader should have to
 * re-derive, and the stamps, which are what connect these bytes to one
 * publication.
 */
export function agentFrontmatter(
  raw: string,
  governance: DocumentGovernance,
  stamps: Stamps,
): string {
  const own = raw.replace(/\s+$/, "");
  const lines = own === "" ? [] : [own];
  lines.push(`trust_tier: ${trustTierOf(governance.verified)}`, ...stampLines(stamps));
  return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * The href for a source that IS a URL, or null when it is a bundle path or a
 * scope descriptor.
 *
 * Only `http(s)` is accepted: `resource` is AUTHORED content, so a
 * `javascript:` or `data:` entry rendered into an href would let the record
 * execute a script in the page that serves it. Other schemes (`mailto:`,
 * `ftp:`) are refused as links rather than widened without a reason.
 */
export function sourceHref(resource: string): string | null {
  const value = resource.trim();
  if (value === "" || /\s/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // `new URL("https://")` throws, but a host-less shape that parses would
  // render an href pointing nowhere.
  return url.host === "" ? null : value;
}

/** A document's supersession pointer, as the record declares it. */
export interface SupersessionPointer {
  /** Path under `knowledge/`, e.g. `policies/purchase-approval-2019.md`. */
  readonly path: string;
  /** Its `ksor.superseded_by` value, or null. */
  readonly supersededBy: string | null;
}

/**
 * The routes of every document that names THIS page as its successor.
 *
 * Supersession ran one way: the withdrawn document names its replacement, and
 * the replacement said nothing about what it replaced, so a reader on the
 * current policy could not reach the history the record deliberately kept. RFC
 * has carried both directions since 1969 (`Obsoletes:` on the new document,
 * `Obsoleted by:` on the old).
 *
 * Derived, never declared — there is no new frontmatter key. Each pointer is
 * resolved through the same rule the forward notice uses, so the two
 * directions can never disagree about what points where.
 */
export function predecessorsOf(
  currentUrl: string,
  pages: readonly RecordPage[],
  pointers: readonly SupersessionPointer[],
): string[] {
  const byPath = new Map(pages.map((page) => [page.path.replaceAll("\\", "/"), page] as const));
  const found: string[] = [];
  for (const pointer of pointers) {
    if (pointer.supersededBy === null) continue;
    const resolved = resolveSuccessorUrl(pointer.supersededBy, pages);
    if (resolved === null || resolved.split("#")[0] !== currentUrl) continue;
    // A document that supersedes itself would otherwise render "Replaces: this
    // page" on the page you are reading. `pnpm check` refuses it; this is the
    // second lock.
    const self = byPath.get(pointer.path.replaceAll("\\", "/"));
    if (self !== undefined && self.url === currentUrl) continue;
    if (self !== undefined) found.push(self.url);
  }
  return found;
}
