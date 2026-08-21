/**
 * The SITE half of the reading-order table (decision 18).
 *
 * `packages/content/src/lib/order-conformance.test.ts` runs every row of
 * ORDER_CASES against the tree adapter's sort — the order the MCP door's
 * `outline` reports. This file runs the same rows against the page-tree sort —
 * the order the website's sidebar and llms.txt report. A surface that drifts
 * fails on the ROW it broke, on whichever side broke it.
 *
 * The page-tree sort is canonical in the kernel (`lib/page-order.ts`, framework
 * -free by construction) and byte-copied into the scaffold, so driving it here
 * drives what the site runs — without booting Next or the content collections.
 */

import { describe, expect, it } from "vitest";

import { ORDER_CASES, type OrderCase } from "../../content/src/lib/order-conformance.js";
import { orderValue } from "../../content/src/lib/order-rule.js";
import { sortNodes, type OrderNode } from "../../content/src/lib/page-order.js";

interface TestNode extends OrderNode {
  readonly children?: readonly TestNode[] | undefined;
}

function nodesFor(kase: OrderCase): {
  nodes: readonly TestNode[];
  orders: ReadonlyMap<string, number>;
} {
  const orders = new Map<string, number>();
  const nodes = kase.entries.map((entry): TestNode => {
    const url = `/docs/${entry.file.replace(/\.mdx?$/, "")}`;
    // The site reads `order:` off the page's own frontmatter through the shared
    // rule, then hands the sort a url→order map. A directory's order comes from
    // its index document, exactly as the adapter reads its index.md.
    if (entry.order !== undefined) orders.set(url, orderValue(entry.order));
    if (entry.file.endsWith(".md")) return { type: "page", url };
    const index = { type: "page", url } as const;
    return { type: "folder", index, children: [index] };
  });
  return { nodes, orders };
}

function urlOf(node: TestNode): string {
  if (node.type === "page") return node.url ?? "";
  if (node.index) return node.index.url;
  const first = node.children?.[0];
  return first === undefined ? "" : urlOf(first);
}

describe("the website's sidebar follows the same reading-order rule", () => {
  it.each(ORDER_CASES)("$name", (kase) => {
    const { nodes, orders } = nodesFor(kase);
    const seen = sortNodes(nodes, orders, 0).map((node) => urlOf(node).replace("/docs/", ""));
    expect(seen, kase.why).toEqual(kase.expected.map((f) => f.replace(/\.mdx?$/, "")));
  });
});

describe("a folder with no index document ties on its FOLDER name", () => {
  it("does not tie on a descendant's url, which sorts the other way", () => {
    // `/` (47) sorts after `-` (45), so comparing whole urls put `guides-x`
    // before the `guides/` folder while the tree adapter — which ties on the
    // entry's own name — put the folder first.
    const guides: TestNode = {
      type: "folder",
      children: [{ type: "page", url: "/docs/guides/first" }],
    };
    const loose: TestNode = { type: "page", url: "/docs/guides-x" };
    const sorted = sortNodes([loose, guides], new Map<string, number>(), 0);
    expect(sorted.map(urlOf)).toEqual(["/docs/guides/first", "/docs/guides-x"]);
  });
});
