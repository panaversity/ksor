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
  // A bare `effective: 2026` types as a NUMBER in YAML and used to disappear
  // from the page entirely — the record declared it and the page said nothing.
  // `pnpm check` refuses it now; showing what the author wrote is still the
  // honest fallback for a record that skipped the checker.
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
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

/** One document as the loader reports it: its source path, and its route. */
export interface RecordPage {
  /** Path under `knowledge/`, e.g. `legal.md` or `handbook/index.md`. */
  readonly path: string;
  /** The route it renders at, e.g. `/docs/legal`. */
  readonly url: string;
}

/** Resolve a relative pointer against the directory holding `from`. */
function resolveFrom(from: string, relative: string): string {
  // The source path is the authority, so it is normalized like one: Windows
  // separators included (the loader reports whatever the filesystem gave it).
  const segments = from.replaceAll("\\", "/").split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

/**
 * The route a `superseded_by` pointer names, or null.
 *
 * Resolved against the document's SOURCE PATH, never against its route. A
 * route cannot tell `knowledge/legal.md` from `knowledge/handbook/index.md` —
 * both render at one path segment — yet `./terms.md` means a sibling in the
 * first and a folder child in the second. Resolving on routes had to guess,
 * and refused to link a record the checker calls well-formed (found live,
 * 2026-08-20: `legal.md` pointing at `./terms.md` beside a `legal/terms.md`
 * rendered the raw pointer instead of a link).
 *
 * Null means the successor is not in THIS build — legitimate for a
 * per-audience build, which stages a subset — and the caller then shows the
 * pointer as text. A dead link on a supersession notice is the worst outcome:
 * it tells the reader to stop trusting the page and then strands them.
 */
export function resolveSuccessorUrl(
  pointer: string,
  currentPath: string,
  pages: readonly RecordPage[],
): string | null {
  // Leaves the record: an absolute URL or a site-absolute path is not a
  // pointer into knowledge/ at all.
  if (pointer.includes("://") || pointer.startsWith("/")) return null;

  const [target = "", anchor] = pointer.split("#", 2);
  if (!target.endsWith(".md")) return null;

  const resolved = resolveFrom(currentPath, target);
  const match = pages.find((page) => page.path.replaceAll("\\", "/") === resolved);
  if (match === undefined) return null;

  return anchor === undefined ? match.url : `${match.url}#${anchor}`;
}

/**
 * Whether a string is a real day on the calendar, not merely date-SHAPED.
 *
 * `2026-06-31` and `2026-13-45` both match a `\d{4}-\d{2}-\d{2}` shape, and
 * stamping either into `<time datetime>` publishes a day that does not exist:
 * invalid HTML, and a consumer parsing it gets July 1st. The record's checker
 * refuses those unquoted and offers QUOTING as the escape hatch — which is
 * exactly how one reaches this function (found 2026-08-21).
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
  const start = lines.findIndex((line) => /^site[ \t]*:[ \t]*(?:#.*)?$/.test(line));
  if (start === -1) {
    // A flow mapping (`site: { governance: false }`) is a scalar to every
    // reader of this block, so a block-only scan would fall through to the
    // default and publish what the owner turned off. `pnpm check` refuses the
    // shape; refuse it here too rather than default past it silently.
    const inline = lines.find((line) => /^site[ \t]*:[ \t]*\S/.test(line));
    if (inline !== undefined) {
      throw new Error(
        `instance.md has ${JSON.stringify(inline.trim())} — a site: group written on one line is ` +
          "not read as a group, so every key inside it is dropped without a word. Write it as an " +
          "indented block:\n  site:\n    governance: false",
      );
    }
    return true;
  }

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    // A non-indented line ends the block: a TOP-LEVEL `governance:` is a
    // different key and must never be mistaken for this setting.
    if (!/^[ \t]/.test(line)) break;
    const match = /^[ \t]+governance[ \t]*:[ \t]*(.*)$/.exec(line);
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

// ---------------------------------------------------------------------------
// The AGENT surface's projection of the same record.
//
// The page shows a superseded document under an unmissable notice; llms.txt and
// llms-full.txt used to serve that same document as ordinary prose — no status,
// no successor, no owner — so an agent answered from a policy the reader had
// been warned about, and could not know (measured on shipped bytes,
// research/site-design.md F1). Two surfaces, two truths, which product
// principle 2 forbids.
//
// Deliberately NOT gated on `site.governance`: that key decides what the PAGES
// publish. The record keeps every key for the agent surface and the audit trail
// (specs/ksor/site-governance/spec.md), so gating this on it would rebuild the
// defect above on purpose.

/** What a reader already assumes of a document in a system of record. */
const ASSUMED_STATUS = "approved";

/**
 * The document's status when it is worth showing, or null.
 *
 * ONE definition, shared by every surface that shows a status — the page chip,
 * the agent index, the record listings. `approved` is silent because that is
 * what a reader already assumes of a document in a system of record, and a
 * label that appears everywhere and always says the same thing trains people to
 * skip it, including on the page where it mattered. An unrecognized state is
 * passed through rather than swallowed: `pnpm check` holds status to a closed
 * set, so reaching here with one means the record skipped the checker, and
 * showing what it wrote beats hiding it.
 */
export function caveatStatus(status: string | null): string | null {
  return status === null || status === ASSUMED_STATUS ? null : status;
}

/**
 * A YAML scalar a consumer can parse back to exactly what the record said. The
 * shapes below are the ones the record's own checker refuses unquoted, for the
 * same reason: unquoted, YAML reads them as something else.
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

/**
 * The suffix for one line of the compact index (`llms.txt`), or "" when the
 * document carries no caveat.
 *
 * Caveats only, unlike the full block below: the index is one line per
 * document, and a marker on every line is noise an agent learns to skip — the
 * same argument that keeps the page's status chip rare.
 *
 * `successorUrl` is the successor's RESOLVED route (the caller owns
 * resolution, including any base path), or null when it is not in this build —
 * a per-audience build stages a subset. A missing successor never suppresses
 * the SUPERSEDED marker: dropping the warning with the link would serve the
 * withdrawn document looking clean, which is the whole defect.
 */
export function agentIndexSuffix(
  governance: DocumentGovernance,
  successorUrl: string | null,
): string {
  const status = caveatStatus(governance.status);
  if (status === null) return "";
  const replaced =
    status === "superseded" && successorUrl !== null ? `, replaced by ${successorUrl}` : "";
  return ` — ${status.toUpperCase()}${replaced}`;
}

/**
 * The governance block that precedes a document's body in `llms-full.txt`,
 * written as frontmatter — the record's own grammar, so a consumer parses the
 * corpus the way the corpus is authored.
 *
 * `status` is emitted even when it is `approved`, which is the opposite call to
 * the page's. A reader assumes a document in a record is current; a consumer
 * assumes nothing, and that silence is exactly what F1 was.
 *
 * Nothing is inferred: an undeclared key is absent, never an empty one, and a
 * document declaring no governance at all yields "".
 */
export function agentFrontmatter(
  governance: DocumentGovernance,
  successorUrl: string | null,
): string {
  const { status, owner, effective, supersededBy, provenance } = governance;
  const lines: string[] = [];
  if (status !== null) lines.push(`status: ${yamlScalar(status)}`);
  if (owner !== null) lines.push(`owner: ${yamlScalar(owner)}`);
  if (effective !== null) lines.push(`effective: ${yamlScalar(effective)}`);
  // The resolved route, never the raw `./successor.md` pointer: a consumer that
  // never sees the record's file tree cannot follow one.
  if (status === "superseded" && supersededBy !== null) {
    lines.push(`superseded_by: ${yamlScalar(successorUrl ?? supersededBy)}`);
  }
  if (provenance.length > 0) {
    lines.push("provenance:");
    for (const entry of provenance) lines.push(`  - ${yamlScalar(entry)}`);
  }
  return lines.length === 0 ? "" : `---\n${lines.join("\n")}\n---\n`;
}

/**
 * The href for a provenance entry that IS a source URL, or null when the entry
 * is an ordinary citation.
 *
 * Deliberately narrow in two directions. The WHOLE entry must be the URL —
 * linkifying a fragment inside "See https://x for the signed copy" would have
 * to guess where the URL ends, and the citation is the entry, not the fragment.
 * And only `http(s)` is accepted: `provenance` is AUTHORED content, so a
 * `javascript:` or `data:` entry rendered into an href would let the record
 * execute a script in the page that serves it. Other schemes (`mailto:`,
 * `ftp:`) are refused as citations rather than links — widen only with a reason.
 */
export function sourceHref(entry: string): string | null {
  const value = entry.trim();
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
