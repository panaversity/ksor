/**
 * The SITE half of the reading-order table (decision 18).
 *
 * `packages/content/src/lib/order-conformance.test.ts` runs every row of
 * ORDER_CASES against the tree adapter's sort — the order the MCP door's
 * `outline` reports. This file runs the same rows against the order the
 * WEBSITE reports.
 *
 * It used to drive `lib/page-order.ts`'s `sortNodes`, which no site module
 * called — decision 18's guard was asserting dead code, and the site was free
 * to report a third, unasserted order. The site's real order is the bytes
 * `generateIndexes` writes, read back by `parseIndex` and walked by
 * `readingOrder` (`system/site/lib/source.ts`) — a second, completely separate
 * implementation, and the one these rows drive now: build the record a row
 * describes, generate its indexes, parse them back, walk them. `page-order.ts`
 * itself was deleted once this test stopped being its only caller; it is in
 * git history if the reason it existed is ever wanted.
 */

import { describe, expect, it } from "vitest";

import { generateIndexes, parseIndex } from "../../content/src/record/index-file.js";
import { ORDER_CASES, type OrderCase } from "../../content/src/lib/order-conformance.js";
import { orderValue } from "../../content/src/lib/order-rule.js";
import { readingOrder } from "../templates/scaffold/system/site/lib/index-routes.js";

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
  it.each(ORDER_CASES)("$name", (kase) => {
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
    // `guides` folds to its child's `order: 1` and `later` carries `order: 2`,
    // so the folder's bullet sits FIRST — and the walk enters it there, which
    // is the property this pins. It reads better now than when folders were
    // emitted last: the folder is in the middle of the walk, so "where the
    // bullet sits" and "at the end" can no longer be confused for each other.
    expect(readingOrder(parsed)).toEqual(["/docs/guides", "/docs/guides/first", "/docs/later"]);
  });
});
