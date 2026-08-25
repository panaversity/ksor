/**
 * The SITE half of the reading-order table (decision 18).
 *
 * `packages/content/src/lib/order-conformance.test.ts` runs every row of
 * ORDER_CASES against the tree adapter's sort — the order the MCP door's
 * `outline` reports. This file runs the same rows against the order the
 * WEBSITE reports.
 *
 * It used to drive `lib/page-order.ts`'s `sortNodes`, which no site module
 * calls: `grep sortNodes` over the tree finds its definition in the two copies
 * of that file and in this test, and nothing else. The site's real order is
 * the bytes `generateIndexes` writes, read back by `parseIndex` and walked by
 * `readingOrder` (`system/site/lib/source.ts:71-73`) — a second, completely
 * separate implementation. So decision 18's guard was asserting dead code, and
 * the site was free to report a third, unasserted order. It does drive the
 * real path now: build the record a row describes, generate its indexes, parse
 * them back, walk them.
 */

import { describe, expect, it } from "vitest";

import { generateIndexes, parseIndex } from "../../content/src/record/index-file.js";
import { ORDER_CASES, type OrderCase } from "../../content/src/lib/order-conformance.js";
import { orderValue } from "../../content/src/lib/order-rule.js";
import { readingOrder } from "../templates/scaffold/system/site/lib/index-routes.js";

/**
 * The one row the generator does not satisfy yet — see the divergence test at
 * the bottom, which fails the day it does, so this exception cannot rot in
 * silence.
 */
const INTERLEAVE_ROW = "a directory orders by its index document, beside the loose files";

/**
 * The row as a record. A `.md` entry is a concept in the root directory; any
 * other entry is a DIRECTORY, given one concept so it earns an index.
 *
 * A concept's title is its own file name, because the table's tie rows are
 * written in terms of names ("ties break on the name with the extension
 * removed", "with case PRESERVED") and the generator ties concepts on title.
 */
function recordFor(kase: OrderCase): Parameters<typeof generateIndexes>[0] {
  const concepts: { id: string; title: string; description: string; order: number | null }[] = [];
  const dirs: string[] = [];
  for (const entry of kase.entries) {
    const value = entry.order === undefined ? null : orderValue(entry.order);
    // `orderValue` returns the kernel's UNORDERED sentinel for anything that
    // is not a finite number; the record carries that as `order: null`.
    const order = value === null || !Number.isFinite(value) ? null : value;
    if (entry.file.endsWith(".md")) {
      const base = entry.file.replace(/\.md$/, "");
      concepts.push({ id: base, title: base, description: "A concept.", order });
      continue;
    }
    dirs.push(entry.file);
    concepts.push({
      id: `${entry.file}/only`,
      title: "Only",
      description: "The folder's one concept.",
      order,
    });
  }
  return { title: "Record", concepts, dirs };
}

/** The root index's bullets as the row names them: `x.md` for a concept, `dir` for a folder. */
function siteOrder(kase: OrderCase): string[] {
  const root = generateIndexes(recordFor(kase)).get("index.md");
  if (root === undefined) throw new Error("the root index was not generated");
  return parseIndex(root).map((entry) => decodeURIComponent(entry.href).replace(/\/$/, ""));
}

describe("the website's reading order is the generated index's order", () => {
  it.each(ORDER_CASES.filter((k) => k.name !== INTERLEAVE_ROW))("$name", (kase) => {
    expect(siteOrder(kase), kase.why).toEqual([...kase.expected]);
  });
});

describe("the walk of the indexes is the order the sidebar and llms.txt share", () => {
  // `readingOrder` is what `source.ts` calls, so the walk itself is pinned
  // here rather than only in a browser.
  it("enters a folder where its bullet sits", () => {
    const indexes = generateIndexes({
      title: "Record",
      dirs: ["guides"],
      concepts: [
        { id: "guides/first", title: "First", description: "d.", order: 1 },
        { id: "later", title: "Later", description: "d.", order: 2 },
      ],
    });
    const parsed = new Map(
      [...indexes].map(([rel, text]) => [
        rel === "index.md" ? "" : rel.slice(0, -"/index.md".length),
        parseIndex(text),
      ]),
    );
    // The folder's bullet is last today (see below), and the walk enters it
    // exactly where the bullet sits — which is the property this pins.
    expect(readingOrder(parsed)).toEqual(["/docs/later", "/docs/guides", "/docs/guides/first"]);
  });
});

/**
 * The ONE row of the table the site does not satisfy, asserted as the
 * divergence it is rather than skipped (decision 22's shape).
 *
 * `generateIndexes` emits every concept bullet and THEN every folder bullet,
 * so a folder never interleaves with a document by `order:` — while the door's
 * tree adapter sorts concepts and directories together. Two surfaces, two
 * reading orders, which is what decision 18 exists to prevent. Fixing it is
 * the KERNEL's call and not this suite's, because interleaving forces one tie
 * key for concepts and folders together and the two halves tie on different
 * things today (title here, file name in the adapter) — a build-spec decision.
 *
 * When the generator interleaves, THIS test fails: delete it and drop
 * `INTERLEAVE_ROW` from the filter above, and the row starts being asserted.
 */
describe("KNOWN DIVERGENCE: the generated index lists folders after documents", () => {
  it("puts an `order: 1` folder behind an `order: 2` document", () => {
    const kase = ORDER_CASES.find((k) => k.name === INTERLEAVE_ROW);
    expect(kase, `ORDER_CASES no longer has the row "${INTERLEAVE_ROW}"`).toBeDefined();
    expect(
      siteOrder(kase!),
      "the generator now interleaves folders with documents — delete this test and stop " +
        "filtering INTERLEAVE_ROW out of the table above",
    ).toEqual(["loose.md", "guides"]);
    expect(kase!.expected).toEqual(["guides", "loose.md"]);
  });
});
