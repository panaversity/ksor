import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import type { Node, Root } from "fumadocs-core/page-tree";

import { agentFrontmatter, readGovernance, resolveSuccessorUrl } from "./governance";

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

// `order:` is a governed frontmatter key; a document without one, or with a
// value that is not a number, sorts after every document that declares one.
function orderOf(page: KnowledgePage): number {
  const raw: unknown = page.data.order;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function nodeOrder(node: Node, orders: ReadonlyMap<string, number>): number {
  if (node.type === "page") return orders.get(node.url) ?? Number.POSITIVE_INFINITY;
  if (node.type === "folder" && node.index) {
    return orders.get(node.index.url) ?? Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

// The tie-break key: a page's url, a folder's index url or first page's url.
// Ties break on it so unordered documents read in plain name order, folders
// interleaved — the canonical reading order both shells implement (found
// live 2026-08-18: the loader's own tie order grouped folders after loose
// files, silently diverging from the Docusaurus shell on the same record).
function nodeName(node: Node): string {
  if (node.type === "page") return node.url;
  if (node.type === "folder") {
    if (node.index) return node.index.url;
    for (const child of node.children) {
      const name = nodeName(child);
      if (name !== "") return name;
    }
  }
  return "";
}

function sortNodes(nodes: readonly Node[], orders: ReadonlyMap<string, number>): Node[] {
  return nodes
    .map((node) =>
      node.type === "folder" ? { ...node, children: sortNodes(node.children, orders) } : node,
    )
    .sort((a, b) => {
      const left = nodeOrder(a, orders);
      const right = nodeOrder(b, orders);
      if (left !== right) return left < right ? -1 : 1;
      const leftName = nodeName(a);
      const rightName = nodeName(b);
      // Codepoint comparison, not locale: reading order must be one bytewise
      // truth on every machine.
      return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
    });
}

/**
 * The page tree with every folder's children ordered by `order:` frontmatter.
 * Rebuilt on each call from a fresh clone — the loader's own tree is shared
 * state and mutating it would survive a hot reload.
 */
export function getSortedPageTree(): Root {
  const orders = new Map(source.getPages().map((page) => [page.url, orderOf(page)] as const));
  const tree = source.getPageTree();
  return { ...tree, children: sortNodes(tree.children, orders) };
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

/**
 * One document as the full-corpus file carries it: heading, then the record's
 * own governance as frontmatter, then the body.
 *
 * The frontmatter is the point. Without it this file served a superseded
 * document as clean prose, so a consumer ingesting the corpus answered from a
 * withdrawn policy with nothing in the bytes to say so (research/site-design.md
 * F1). `pages` resolves a successor pointer to the route a consumer can
 * actually fetch.
 */
export async function getLLMText(
  page: KnowledgePage,
  pages: readonly KnowledgePage[] = [],
): Promise<string> {
  const processed = await page.data.getText("processed");
  const governance = readGovernance(page.data, page.path);
  const successor =
    governance.supersededBy === null
      ? null
      : resolveSuccessorUrl(governance.supersededBy, page.path, pages);
  const front = agentFrontmatter(governance, successor === null ? null : basePath + successor);

  // found live 2026-08-21: the processed markdown arrives with its own leading
  // blank lines, so every block opened with three of them — and adding the
  // frontmatter above made it four. One blank line between each part, always.
  return [`# ${page.data.title} (${basePath}${page.url})`, front.trimEnd(), processed.trimStart()]
    .filter((part) => part !== "")
    .join("\n\n");
}
