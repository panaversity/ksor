/**
 * Turning the reading-order rule into a sorted page tree — the SITE's half of
 * decision 18, and canonical here so it can be tested.
 *
 * It names no framework type — the page-tree node shape is declared
 * structurally below — for two reasons: the file is byte-copied into the
 * scaffold's site, where it runs against Fumadocs's `Node`; and a rule that can
 * only be exercised inside a Next build is a rule nobody exercises. The kernel
 * has no website — it carries this so the SAME ORDER_CASES rows can be run
 * against the tree sort a reader actually sees.
 *
 * Structural, not nominal: any node shaped like this sorts, which is what makes
 * one file serve both the real page tree and the table's fixtures.
 */

import { compareSiblings, UNORDERED } from "./order-rule.js";

/** The members of a page-tree node that reading order depends on. */
export interface OrderNode {
  readonly type: string;
  /** A page's route. Absent on folders. */
  readonly url?: string;
  /** A folder's index document, when it has one. */
  readonly index?: { readonly url: string } | undefined;
  readonly children?: readonly OrderNode[] | undefined;
}

function nodeOrder(node: OrderNode, orders: ReadonlyMap<string, number>): number {
  if (node.type === "page") return orders.get(node.url ?? "") ?? UNORDERED;
  if (node.type === "folder" && node.index) return orders.get(node.index.url) ?? UNORDERED;
  return UNORDERED;
}

// A url that identifies this node: its own, its index's, or its first
// descendant's — a folder with no index document has no url of its own.
function nodeUrl(node: OrderNode): string {
  if (node.type === "page") return node.url ?? "";
  if (node.type === "folder") {
    if (node.index) return node.index.url;
    for (const child of node.children ?? []) {
      const url = nodeUrl(child);
      if (url !== "") return url;
    }
  }
  return "";
}

// The index of a top-level document's own segment: "/docs/x" splits to
// ["", "docs", "x"], so its segment is at 2 — the baseUrl's segment count.
const BASE_SEGMENTS = "/docs".split("/").length;

/**
 * The tie key: the ONE path segment that distinguishes this node from its
 * siblings — never the whole url.
 *
 * The tree adapter ties on the entry's own name, so a folder with no index
 * document must tie on its folder name too. Its url comes from a descendant
 * (`/docs/guides/first`), and comparing that whole url against a sibling
 * `/docs/guides-x` puts them in the opposite order, because the separator `/`
 * (47) sorts after `-` (45). Taking the segment at this depth is exactly the
 * adapter's key.
 */
function tieAt(node: OrderNode, depth: number): string {
  return nodeUrl(node).split("/")[BASE_SEGMENTS + depth] ?? "";
}

/**
 * Children of one parent, in reading order, recursively.
 *
 * Generic in the node so the caller keeps its own richer type: the site passes
 * Fumadocs `Node`s and gets `Node`s back. The one cast is the rebuilt folder —
 * spreading a node and replacing `children` produces a value TypeScript can no
 * longer prove is the same subtype, though it is: every other member is copied
 * verbatim. `depth` starts at 0 for the tree's own children.
 */
export function sortNodes<T extends OrderNode>(
  nodes: readonly T[],
  orders: ReadonlyMap<string, number>,
  depth: number,
): T[] {
  return nodes
    .map((node) =>
      node.type === "folder"
        ? ({ ...node, children: sortNodes(node.children ?? [], orders, depth + 1) } as T)
        : node,
    )
    .sort((a, b) =>
      compareSiblings(
        { order: nodeOrder(a, orders), tie: tieAt(a, depth) },
        { order: nodeOrder(b, orders), tie: tieAt(b, depth) },
      ),
    );
}
