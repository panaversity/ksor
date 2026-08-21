/**
 * The reading-order decision table. THIS is the rule; the kernel's tree sort
 * and the site's page-tree sort are two readings of it, and both are asserted
 * against these rows (decision 18).
 *
 * A row is one parent's children, written in the order a reader should meet
 * them. Adding a guarantee about reading order means adding a row here first.
 */

export interface OrderCase {
  readonly name: string;
  readonly why: string;
  /** Sibling entries as they appear on disk, in ARBITRARY input order. */
  readonly entries: readonly { readonly file: string; readonly order?: unknown }[];
  /** The file names, in the order both surfaces must produce. */
  readonly expected: readonly string[];
}

export const ORDER_CASES: readonly OrderCase[] = [
  {
    name: "declared order wins over the filename",
    why: "the whole point of the key: an author numbers a curriculum and both surfaces read it",
    entries: [
      { file: "zebra.md", order: 1 },
      { file: "apple.md", order: 2 },
    ],
    expected: ["zebra.md", "apple.md"],
  },
  {
    name: "an ordered document precedes every unordered one",
    why: "the live failure: `order: 1` sat behind an unordered `00-…` file in the MCP outline",
    entries: [{ file: "00-intro.md" }, { file: "example.md", order: 1 }],
    expected: ["example.md", "00-intro.md"],
  },
  {
    name: "a LARGE order still precedes an unordered document",
    why: "unordered is the absence of an order, not a big one — the kernel's 10_000 sentinel",
    entries: [{ file: "later.md", order: 20_000 }, { file: "unordered.md" }],
    expected: ["later.md", "unordered.md"],
  },
  {
    name: "fractional orders are kept, not truncated",
    why: "Math.trunc collapsed 3.2 and 3.7 into one position and re-sorted them by name",
    entries: [
      { file: "b.md", order: 3.7 },
      { file: "a.md", order: 3.2 },
    ],
    expected: ["a.md", "b.md"],
  },
  {
    name: "a numeric string is an order",
    why: "frontmatter is read by scanners on both surfaces; the author cannot know which quotes matter",
    entries: [
      { file: "second.md", order: "2" },
      { file: "first.md", order: " 1 " },
    ],
    expected: ["first.md", "second.md"],
  },
  {
    name: "a non-numeric order is no order at all",
    why: "`order: first` must not silently become 0 and jump the queue",
    entries: [
      { file: "b-worded.md", order: "first" },
      { file: "a-numbered.md", order: 9 },
    ],
    expected: ["a-numbered.md", "b-worded.md"],
  },
  {
    name: "booleans and empties are no order",
    why: "same class — anything that is not a finite number sorts unordered",
    entries: [
      { file: "c.md", order: true },
      { file: "b.md", order: "" },
      { file: "a.md", order: 1 },
    ],
    expected: ["a.md", "b.md", "c.md"],
  },
  {
    name: "negative orders sort before positive ones",
    why: "an author pinning a preface ahead of a numbered sequence",
    entries: [
      { file: "one.md", order: 1 },
      { file: "preface.md", order: -1 },
    ],
    expected: ["preface.md", "one.md"],
  },
  {
    name: "ties break on the name with the extension REMOVED",
    why: "`-` (45) sorts before `.` (46), so comparing `example.md` reversed this ordinary pair",
    entries: [{ file: "example-two.md" }, { file: "example.md" }],
    expected: ["example.md", "example-two.md"],
  },
  {
    name: "ties break with case PRESERVED",
    why: "the kernel lowercased the tie key and the site did not; opposite orders on the same pair",
    entries: [{ file: "apple.md" }, { file: "Banana.md" }],
    expected: ["Banana.md", "apple.md"],
  },
  {
    name: "a dotted directory name keeps its dot in the tie key",
    why: "only a markdown extension comes off; `v1.2` is a route segment on the site",
    entries: [{ file: "v1.2" }, { file: "v1-notes.md" }],
    expected: ["v1-notes.md", "v1.2"],
  },
  {
    name: "a directory orders by its index document, beside the loose files",
    why: "folders interleave with documents — one reading order, not files-then-folders",
    entries: [
      { file: "loose.md", order: 2 },
      { file: "guides", order: 1 },
    ],
    expected: ["guides", "loose.md"],
  },
];
