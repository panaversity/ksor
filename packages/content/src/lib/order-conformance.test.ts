/**
 * Reading order is ONE rule (decision 18). This file asserts the kernel half:
 * the rule itself against every row of the decision table, and then the tree
 * adapter — the code that decides what the MCP door's `outline` reports —
 * against the same rows, so a surface that drifts fails on the ROW it broke.
 *
 * The site half runs in `packages/ksor/src/order-conformance.integration.test.ts`
 * against the scaffold's copy of the same table.
 */

import { describe, expect, it } from "vitest";

import { buildManifestFromTree, type TreeDir } from "../ingest/adapters/plain-tree.js";
import { ORDER_CASES, type OrderCase } from "./order-conformance.js";
import { compareSiblings, orderValue, tieKey, UNORDERED } from "./order-rule.js";

/** One entry's frontmatter, written the way an author writes it. */
function docText(order: unknown): string {
  const declared = order === undefined ? "" : `\norder: ${String(order)}`;
  // Bodies must be long enough to be content rather than navigation, but the
  // order rule never reads them — any prose does.
  return `---\ntitle: T${declared}\nstatus: draft\n---\n\nBody text for an ordering fixture.\n`;
}

function treeFor(kase: OrderCase): TreeDir {
  return {
    kind: "dir",
    name: "knowledge",
    entries: kase.entries.map((e) =>
      e.file.endsWith(".md")
        ? ({ kind: "file", name: e.file, text: docText(e.order) } as const)
        : ({
            kind: "dir",
            name: e.file,
            entries: [{ kind: "file", name: "index.md", text: docText(e.order) }],
          } as const),
    ),
  };
}

describe("the reading-order rule, row by row", () => {
  it.each(ORDER_CASES)("$name", (kase) => {
    const sorted = [...kase.entries]
      .map((e) => ({ file: e.file, order: orderValue(e.order), tie: tieKey(e.file) }))
      .sort(compareSiblings)
      .map((s) => s.file);
    expect(sorted, kase.why).toEqual([...kase.expected]);
  });
});

describe("the MCP door's outline follows that rule — the adapter's own sort", () => {
  it.each(ORDER_CASES)("$name", (kase) => {
    const { manifest } = buildManifestFromTree(treeFor(kase), {
      corpusId: "c",
      sourceCommit: "0".repeat(40),
      onSkip: () => {},
    });
    // One node per sibling: a document is `knowledge/<stem>`, a directory is
    // `knowledge/<name>/index` — both carry the sibling rank in `position`.
    const stems = kase.entries.map((e) => e.file.replace(/\.mdx?$/, ""));
    const nodeFor = (stem: string): { position: number } => {
      const node = manifest.nodes.find(
        (n) => n.stable_id === `knowledge/${stem}` || n.stable_id === `knowledge/${stem}/index`,
      );
      if (node === undefined) {
        throw new Error(
          `fixture built wrong: no node for ${stem} in ${JSON.stringify(
            manifest.nodes.map((n) => n.stable_id),
          )}`,
        );
      }
      return node;
    };
    const seen = [...stems]
      .sort((a, b) => nodeFor(a).position - nodeFor(b).position)
      .map((stem) => stem);
    // Positions must be a permutation of 1..n — a tie would make the sort above
    // depend on input order rather than on the rule.
    const positions = stems.map((s) => nodeFor(s).position).sort((a, b) => a - b);
    expect(positions, "sibling positions must be distinct and dense").toEqual(
      stems.map((_, i) => i + 1),
    );
    expect(seen, kase.why).toEqual(kase.expected.map((f) => f.replace(/\.mdx?$/, "")));
  });
});

describe("UNORDERED is the absence of an order, not a large one", () => {
  it("is greater than any order an author could plausibly declare", () => {
    expect(UNORDERED).toBe(Number.POSITIVE_INFINITY);
    expect(orderValue(Number.MAX_SAFE_INTEGER) < UNORDERED).toBe(true);
  });
});
