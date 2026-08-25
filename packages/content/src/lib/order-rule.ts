/**
 * Reading order — ONE rule, for the website and the MCP door alike.
 *
 * `order:` is the only ordering key an author may write: it is in the governed
 * frontmatter set the format checker closes, and the checker's own remedy for a
 * stray `meta.json` says so ("sidebar order is the `order` frontmatter key").
 *
 * The MCP door did not read it. The kernel's tree adapter was converted from
 * the predecessor, where the ordering keys were Docusaurus's `position` /
 * `sidebar_position` — neither of which a compliant record may declare, because
 * the checker refuses them as unknown keys. So the two surfaces disagreed about
 * the record's reading order for every corpus that ordered itself at all: the
 * site honoured `order:` and the door fell back to filename order and called it
 * the record's structure. On a curriculum, where reading order IS the content,
 * an agent asking `outline` for "what do I read first" got the wrong answer
 * (found live 2026-08-21, by an agent probing a real ingested record).
 *
 * That is decision 18's shape — one guarantee, two surfaces, two heads — so it
 * gets decision 18's treatment: this file is the rule, `ORDER_CASES` is the
 * decision table, and both surfaces are asserted against the same rows. The
 * site cannot import the kernel, so this file is COPIED into the scaffold and
 * the copy is asserted byte-identical rather than trusted.
 *
 * Four things the two surfaces disagreed about beyond the key name, each of
 * which is a row in the table:
 *
 *   - the unordered sentinel. The kernel used 10_000, a real number, so
 *     `order: 20000` sorted AFTER an unordered document in the door and BEFORE
 *     it on the site. Unordered is not a large order; it is the absence of one.
 *   - truncation. The kernel applied `Math.trunc`, collapsing 3.2 and 3.7 into
 *     one position and re-sorting them by name; the site kept both.
 *   - the tie key's extension. The kernel compared `example.md` against
 *     `example-two.md` — where `-` (45) sorts before `.` (46) — while the site
 *     compared the extensionless urls, where the shorter is a prefix and wins.
 *     Two ordinary filenames, two different orders.
 *   - case. The kernel lowercased the tie key and the site did not, so
 *     `apple.md` and `Banana.md` came out in opposite orders.
 *
 * Two more, found in the OKF-native review and fixed the same way:
 *
 *   - folders. The index generator emitted every concept bullet and THEN every
 *     folder bullet, so a folder could never sort between two documents, while
 *     the tree adapter sorted concepts and directories in one list. The site
 *     takes its whole reading order from the generated indexes, so an agent
 *     asking `outline` "what do I read first" and a reader on the site were
 *     told different documents. The ratified row has always said they
 *     interleave.
 *   - the folder's own key. The generator folded over every concept BENEATH a
 *     directory; the adapter folded over the directory's OWN concepts only, so
 *     a folder whose ordered documents live one level deeper was unordered on
 *     one surface and first on the other. {@link folderOrder} is now the one
 *     answer both call.
 *
 * No imports: a leaf, so it is testable in isolation and safe to copy.
 */

/**
 * A document that declares no usable `order:` sorts after every document that
 * does. Infinity, not a large number — see above.
 */
export const UNORDERED: number = Number.POSITIVE_INFINITY;

/**
 * The `order:` frontmatter value as a sort key.
 *
 * A numeric string is accepted because YAML frontmatter is read by scanners
 * here, not by a YAML library: `order: 3` and `order: "3"` both reach this as
 * text on one surface and as a number on the other, and an author cannot be
 * expected to know which. Anything that is not a finite number — a word, a
 * boolean, an empty value — is NOT an order, and the document sorts unordered.
 */
export function orderValue(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : UNORDERED;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return UNORDERED;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : UNORDERED;
  }
  return UNORDERED;
}

/**
 * The tie key for one sibling: its name with a MARKDOWN extension removed,
 * case PRESERVED. The extension comes off because the site compares routes,
 * which never carry one, and `.` sorting after `-` silently reversed ordinary
 * pairs. Only `.md`/`.mdx` come off — a directory named `v1.2` keeps its dot,
 * because the site's route keeps it too. Case is preserved because the site
 * compares urls, and the url is what a reader sees.
 */
export function tieKey(name: string): string {
  return name.replace(/\.mdx?$/, "");
}

/** One sibling's place in its parent: what it declared, and how ties break. */
export interface Sibling {
  readonly order: number;
  readonly tie: string;
}

/**
 * Compare by code point, not by locale or UTF-16 unit: reading order must be
 * one bytewise truth on every machine, and `<` on strings compares UTF-16 units
 * — which differ from code points on astral names.
 */
export function codePointCompare(a: string, b: string): number {
  const as = [...a];
  const bs = [...b];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const x = as[i]?.codePointAt(0) ?? 0;
    const y = bs[i]?.codePointAt(0) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return as.length === bs.length ? 0 : as.length < bs.length ? -1 : 1;
}

/** Declared order first; ties break on the tie key. Total, and stable-safe. */
export function compareSiblings(a: Sibling, b: Sibling): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return codePointCompare(a.tie, b.tie);
}

/**
 * A directory's sort key: the lowest order among the concepts anywhere BENEATH
 * it, descendants included — a folder sorts where its first concept does.
 *
 * Descendants and not just the directory's own concepts, because a folder whose
 * documents live one level deeper (`alpha/deep/a.md`) still has a first thing to
 * read, and calling it unordered files the whole folder behind every ordered
 * sibling. `ordersByDir` maps a bundle-relative directory to the orders of the
 * concepts sitting DIRECTLY in it, which is the shape both callers already hold.
 */
export function folderOrder(
  ordersByDir: Iterable<readonly [string, readonly number[]]>,
  dir: string,
): number {
  let min = UNORDERED;
  for (const [d, orders] of ordersByDir) {
    if (d !== dir && !d.startsWith(`${dir}/`)) continue;
    for (const o of orders) if (o < min) min = o;
  }
  return min;
}
