import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import type { Node, Root } from "fumadocs-core/page-tree";

import { orderValue } from "./order-rule.js";
import { sortNodes } from "./page-order.js";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type KnowledgePage = (typeof source)["$inferPage"];

// Sub-path hosting prefix, for URLs we WRITE INTO TEXT (llms.txt,
// llms-full.txt). Next's <Link> and the router prepend basePath themselves,
// so this must never touch the loader's baseUrl — that would double-prefix
// every rendered link.
export const basePath: string = process.env.KSOR_BASE_PATH ?? "";

// Reading order is ONE rule, shared with the MCP door byte-for-byte — see
// ./order-rule.ts. The site cannot import the kernel, so the rule is copied and
// the copy is asserted; every case both surfaces must agree on is a row in the
// kernel's ORDER_CASES table, and this half is asserted against the same rows.
function orderOf(page: KnowledgePage): number {
  return orderValue(page.data.order);
}

/**
 * The page tree with every folder's children ordered by `order:` frontmatter.
 * Rebuilt on each call from a fresh clone — the loader's own tree is shared
 * state and mutating it would survive a hot reload.
 */
export function getSortedPageTree(): Root {
  const orders = new Map(source.getPages().map((page) => [page.url, orderOf(page)] as const));
  const tree = source.getPageTree();
  return { ...tree, children: sortNodes(tree.children, orders, 0) };
}

function collectUrls(nodes: readonly Node[], urls: string[]): void {
  for (const node of nodes) {
    if (node.type === "page") urls.push(node.url);
    else if (node.type === "folder") {
      if (node.index) urls.push(node.index.url);
      collectUrls(node.children, urls);
    }
  }
}

/**
 * Every page, in the order the sidebar shows them — the one reading order the
 * site, llms.txt and llms-full.txt all serve.
 */
export function getSortedPages(): KnowledgePage[] {
  const urls: string[] = [];
  collectUrls(getSortedPageTree().children, urls);

  const remaining = new Map(source.getPages().map((page) => [page.url, page] as const));
  const ordered: KnowledgePage[] = [];
  for (const url of urls) {
    const page = remaining.get(url);
    if (page) {
      ordered.push(page);
      remaining.delete(url);
    }
  }
  // A page the tree never displayed is still part of the record.
  return [...ordered, ...remaining.values()];
}

export async function getLLMText(page: KnowledgePage): Promise<string> {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${basePath}${page.url})

${processed}`;
}
