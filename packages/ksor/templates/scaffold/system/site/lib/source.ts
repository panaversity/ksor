import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { statusBadgesPlugin } from "fumadocs-core/source/plugins/status-badges";
import type { Node, Root } from "fumadocs-core/page-tree";

import {
  agentFrontmatter,
  agentIndexSuffix,
  caveatStatus,
  readGovernance,
  resolveSuccessorUrl,
} from "./governance";
import { appName, showGovernance } from "./shared";
import { renderCaveatBadge } from "@/components/sidebar-status";
import { orderValue } from "./order-rule";
import { sortNodes } from "./page-order";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  plugins: [
    lucideIconsPlugin(),
    // The shell's own status plugin, which reads `status` from a document's
    // frontmatter and puts it on the tree node. This used to be a map of
    // statuses by url and a second walk over the tree that rewrote each row's
    // `name` — the plugin does the walk, so the record's own key reaches the
    // sidebar without us restating it.
    //
    // `renderBadge` returns null for anything that is not a caveat, which is
    // the one rule that is OURS: a reader already assumes a document in the
    // record is current, so `approved` shows nothing and the marker stays rare
    // enough to be noticed where it matters.
    statusBadgesPlugin({ renderBadge: (status) => renderCaveatBadge(status) }),
  ],
});

// The page tree's root is named "Docs" by default — fumadocs' fallback for a
// directory carrying no meta.json. It names the software, not the thing a
// reader is inside, and it is what the breadcrumb's first item says. The
// record already has a name in instance.md, so it says that instead. Set here
// rather than passed to the breadcrumb, because `slots` crosses a client
// boundary and a server value cannot ride along with it — the tree can.
source.pageTree.name = appName;

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
  const pages = source.getPages();
  const orders = new Map(pages.map((page) => [page.url, orderOf(page)] as const));
  // The caveat status already rides the row: `statusBadgesPlugin` above put it
  // there while the loader built the tree, so the reader sees it before the
  // click rather than after (research/site-design.md F3). This function is
  // left with the one thing the shell has no opinion about — the record's
  // governed `order:`.
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

/** One entry in a record listing — everything a reader needs to choose. */
export interface RecordEntry {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  /** The document's status when it is a caveat, else null. */
  readonly status: string | null;
  /**
   * Who stands behind it. Null when the record declares no owner — and null
   * for every document when `site.governance` is off, because an owner is a
   * governance fact and that key turns the pages plain.
   */
  readonly owner: string | null;
  /** How many documents this entry holds below it; 0 for a leaf. */
  readonly documents: number;
}

/**
 * The record's entry for one page — what any listing needs.
 *
 * Exported because the front door leads with the document `Open the record`
 * opens, which is the first page in governed order and may sit BELOW the top
 * level, where `entriesUnder(null)` would never return it.
 */
export function entryFor(page: KnowledgePage): RecordEntry {
  const data: Record<string, unknown> = page.data as unknown as Record<string, unknown>;
  const description = typeof data["description"] === "string" ? data["description"].trim() : "";
  const status = typeof data["status"] === "string" ? data["status"].trim() : "";
  return {
    url: page.url,
    title: page.data.title,
    description: description === "" ? null : description,
    status: caveatStatus(status === "" ? null : status),
    owner: showGovernance ? readGovernance(page.data, page.path).owner : null,
    documents: 0,
  };
}

/**
 * How many documents a folder holds, its own index page excluded — the index
 * IS the entry being counted, not something below it.
 *
 * By url in a set, not by adding lengths: whether a folder's index also
 * appears among its children is the loader's business, and counting it twice
 * would publish a number the record cannot support.
 */
function countDocuments(folder: Extract<Node, { type: "folder" }>): number {
  const urls = new Set<string>();
  const walk = (nodes: readonly Node[]): void => {
    for (const node of nodes) {
      if (node.type === "page") urls.add(node.url);
      else if (node.type === "folder") {
        if (node.index) urls.add(node.index.url);
        walk(node.children);
      }
    }
  };
  walk(folder.children);
  if (folder.index) urls.delete(folder.index.url);
  return urls.size;
}

/**
 * The entries directly below a node of the record, in the governed reading
 * order — or the top level when `url` is null.
 *
 * A folder's own index page is not listed under itself: it IS the page doing
 * the listing. Without this, `/docs/policies` opened with a card pointing back
 * at `/docs/policies`.
 */
export function entriesUnder(url: string | null): RecordEntry[] {
  const byUrl = new Map(getSortedPages().map((page) => [page.url, page] as const));
  const nodes = url === null ? getSortedPageTree().children : childrenOfFolder(url);
  const entries: RecordEntry[] = [];
  for (const node of nodes) {
    const target =
      node.type === "page" ? node.url : node.type === "folder" ? node.index?.url : null;
    if (target === undefined || target === null || target === url) continue;
    const page = byUrl.get(target);
    if (page === undefined) continue;
    entries.push(
      node.type === "folder"
        ? { ...entryFor(page), documents: countDocuments(node) }
        : entryFor(page),
    );
  }
  return entries;
}

/**
 * The record as `llms.txt` serves it: the instance name, then every document in
 * the governed reading order, each carrying its governance when the governance
 * is a caveat.
 *
 * Here rather than in the route, because the home page shows these same bytes
 * to a reader. Two spellings of the record's index would be two indexes, and
 * the one on the page would be the one nobody checked.
 */
export function recordIndexText(): string {
  const pages = getSortedPages();
  const lines = pages.map((page) => {
    const governance = readGovernance(page.data, page.path);
    const successor =
      governance.supersededBy === null
        ? null
        : resolveSuccessorUrl(governance.supersededBy, page.path, pages);
    const link = `- [${page.data.title}](${basePath}${page.url})`;
    const described = page.data.description ? `${link}: ${page.data.description}` : link;
    // The successor's route is prefixed like every other URL here, so the line
    // is usable as-is on a sub-path host.
    return (
      described + agentIndexSuffix(governance, successor === null ? null : basePath + successor)
    );
  });
  return `# ${appName}\n\n${lines.join("\n")}\n`;
}

/**
 * The route of a document's markdown twin — `/docs/policies/terms` becomes
 * `/md/policies/terms.md`, and the record's own index becomes `/md/index.md`.
 *
 * One rule, one place: the docs page derives the same address from its route
 * params for `rel="alternate"`, and a second spelling of it here would be a
 * broken link the day either changes.
 */
export function markdownPath(url: string): string {
  const slug = url.replace(/^\/docs\/?/, "").replace(/\/$/, "");
  return `${basePath}/md/${slug === "" ? "index" : slug}.md`;
}

/** The children of the folder whose index page is at `url`, or []. */
function childrenOfFolder(url: string): Node[] {
  const find = (nodes: readonly Node[]): Node[] | null => {
    for (const node of nodes) {
      if (node.type !== "folder") continue;
      if (node.index?.url === url) return [...node.children];
      const deeper = find(node.children);
      if (deeper !== null) return deeper;
    }
    return null;
  };
  return find(getSortedPageTree().children) ?? [];
}

/**
 * Every document's caveat status, keyed by route — the small map the search
 * dialog needs on the client.
 *
 * Search was the last surface where a withdrawn document and the one that
 * replaced it looked identical, and its snippet quotes the withdrawn figure
 * (research/site-design.md F3). The dialog runs in the browser over a static
 * index that has no field for status, so the map travels to it as a prop
 * instead: a few dozen bytes per caveat document, and nothing at all for a
 * record whose documents are all approved.
 */
export function caveatStatusByUrl(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const page of source.getPages()) {
    const raw: unknown = (page.data as unknown as Record<string, unknown>)["status"];
    const status = caveatStatus(typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null);
    if (status !== null) out[page.url] = status;
  }
  return out;
}
