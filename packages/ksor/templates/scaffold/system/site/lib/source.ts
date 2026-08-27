import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import type { Node, Root } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

import { agentFrontmatter, badgeLabel, readGovernance, stampLines } from "./governance";
import { dirOfRoute, listingOf, readingOrder } from "./index-routes";
import type { LifecycleBadge } from "./lifecycle-rule";
import { appName, appTitle, appDescription, showGovernance } from "./shared";
import {
  readStagedIndex,
  readStageManifest,
  stagedBody,
  stagedFrontmatter,
  stagePageOf,
} from "./stage-manifest";
import { renderBadge } from "@/components/sidebar-status";
import { generateIndexes, humanise, type IndexEntry } from "../record/index-file";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
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

/** A page's bundle-relative path with forward slashes — the manifest's key. */
function pathOf(page: KnowledgePage): string {
  return page.path.replaceAll("\\", "/");
}

/**
 * Every directory this viewer's stage holds an index for, root first, with
 * its parsed index — walked from the root index's folder bullets, so a folder
 * this viewer may not see is never even asked for.
 */
function stagedIndexes(): Map<string, IndexEntry[]> {
  const out = new Map<string, IndexEntry[]>();
  const walk = (dir: string): void => {
    const entries = readStagedIndex(dir);
    if (entries === null) return;
    out.set(dir, entries);
    for (const item of listingOf(dir, entries)) if (item.kind === "folder") walk(item.path);
  };
  walk("");
  return out;
}

/**
 * Reading order is ONE rule — the index generator's (build spec §1: one bullet
 * list, concepts and folders together, by `order:` then name) — and every
 * surface takes it from the regenerated indexes rather than restating it. A
 * route the indexes never listed sorts last, by url.
 */
function positions(): Map<string, number> {
  return new Map(readingOrder(stagedIndexes()).map((url, i) => [url, i] as const));
}

// The index of a top-level entry's own segment: "/docs/x" splits to
// ["", "docs", "x"], so its segment is at 2 — the baseUrl's segment count.
const BASE_SEGMENTS = "/docs".split("/").length;

/**
 * A node's own route at `depth`: a page's url, or a folder's route derived
 * from any descendant, TRUNCATED to this depth.
 *
 * The truncation is the whole point, not tidiness. A folder with no index
 * document takes its url from a descendant (`/docs/guides/first`), and
 * comparing that whole url against a sibling `/docs/guides-x` puts the two in
 * the opposite order, because the separator `/` (47) sorts after `-` (45).
 * Cutting to this depth compares `/docs/guides` against `/docs/guides-x`,
 * which is what the reading-order rule means by a sibling name.
 */
function routeAt(node: Node, depth: number): string {
  if (node.type === "page") return node.url;
  if (node.type === "folder") {
    const descendant = node.index?.url ?? firstPageUrl(node.children);
    if (descendant !== null) {
      return descendant
        .split("/")
        .slice(0, BASE_SEGMENTS + depth + 1)
        .join("/");
    }
  }
  return "";
}

function firstPageUrl(nodes: readonly Node[]): string | null {
  for (const node of nodes) {
    if (node.type === "page") return node.url;
    if (node.type === "folder") {
      const url = node.index?.url ?? firstPageUrl(node.children);
      if (url !== null) return url;
    }
  }
  return null;
}

function sortTree(
  nodes: readonly Node[],
  order: ReadonlyMap<string, number>,
  depth: number,
): Node[] {
  const rank = (node: Node): number => order.get(routeAt(node, depth)) ?? Number.POSITIVE_INFINITY;
  return nodes
    .map((node): Node => {
      if (node.type === "folder") {
        const url = routeAt(node, depth);
        // The folder's own page — the regenerated index rendered as a listing
        // — so the sidebar row LINKS the folder rather than only toggling it.
        const index: Node & { type: "page" } = { type: "page", name: node.name, url };
        return { ...node, index, children: sortTree(node.children, order, depth + 1) };
      }
      if (node.type === "page") {
        const badge = stagePageOf(pagePathByUrl().get(node.url) ?? "")?.badge ?? null;
        return badge === null ? node : { ...node, name: withBadge(node.name, badge) };
      }
      return node;
    })
    .sort((a, b) => rank(a) - rank(b) || routeAt(a, depth).localeCompare(routeAt(b, depth)));
}

function withBadge(name: ReactNode, badge: LifecycleBadge): ReactNode {
  return renderBadge(name, badge);
}

let urlToPath: Map<string, string> | null = null;
function pagePathByUrl(): Map<string, string> {
  if (urlToPath === null) {
    urlToPath = new Map(source.getPages().map((page) => [page.url, pathOf(page)] as const));
  }
  return urlToPath;
}

/**
 * The page tree in reading order, every folder linking its own page and every
 * page carrying its badge. Rebuilt on each call from a fresh clone — the
 * loader's own tree is shared state and mutating it would survive a hot reload.
 */
export function getSortedPageTree(): Root {
  const tree = source.getPageTree();
  return { ...tree, children: sortTree(tree.children, positions(), 0) };
}

/**
 * Every page the human surfaces show, in the one reading order — the sidebar,
 * the folder pages and the home page all walk this list.
 */
export function getSortedPages(): KnowledgePage[] {
  const order = positions();
  return [...source.getPages()].sort(
    (a, b) =>
      (order.get(a.url) ?? Number.POSITIVE_INFINITY) -
        (order.get(b.url) ?? Number.POSITIVE_INFINITY) || a.url.localeCompare(b.url),
  );
}

/**
 * The pages the MACHINE surfaces admit — `llms.txt`, `llms-full.txt`, the
 * twins: stable, effective, unexpired at the build's `as_of`, decided ONCE by
 * staging and read back from its manifest (record spec §2.5). A route cannot
 * widen this; it can only read it.
 */
export function getMachinePages(): KnowledgePage[] {
  return getSortedPages().filter((page) => stagePageOf(pathOf(page))?.machine === true);
}

/**
 * One document as the full-corpus file and its twin carry it: heading, then the
 * record's OWN frontmatter intact under the build's stamps, then the record's
 * OWN body.
 *
 * The frontmatter is the point — without it a consumer ingesting the corpus had
 * no way to tell a passage's status, owner or source, and nothing connecting it
 * to the publication it came from (R14) — and both halves are served intact so
 * that what a consumer parses is the profile's grammar rather than this shell's
 * rendering of it. Body from the STAGE, never from fumadocs' processed
 * markdown: see `stagedBody`, and the door, which serves these same bytes.
 */
export function getLLMText(page: KnowledgePage): string {
  const body = stagedBody(page.path);
  const front = agentFrontmatter(
    stagedFrontmatter(page.path),
    readGovernance(page.data, page.path),
    readStageManifest().stamps,
  );
  // found live 2026-08-21: the body arrives with its own leading blank lines,
  // so every block opened with three of them — and adding the frontmatter above
  // made it four. One blank line between each part, always.
  return [`# ${page.data.title} (${basePath}${page.url})`, front.trimEnd(), body.trimStart()]
    .filter((part) => part !== "")
    .join("\n\n");
}

/** One entry in a record listing — everything a reader needs to choose. */
export interface RecordEntry {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  /** Why the machine surfaces decline it, when they do; else null. */
  readonly badge: LifecycleBadge | null;
  /**
   * Who stands behind it. Null when the record declares no owner — and null
   * for every document when `site.governance` is off, because an owner is a
   * governance fact and that key turns the pages plain.
   */
  readonly owner: string | null;
  /** How many documents this entry holds below it; 0 for a leaf. */
  readonly documents: number;
}

/** The record's entry for one page — what any listing needs. */
export function entryFor(page: KnowledgePage): RecordEntry {
  return {
    url: page.url,
    title: page.data.title,
    description: page.data.description?.trim() || null,
    badge: stagePageOf(pathOf(page))?.badge ?? null,
    owner: showGovernance ? readGovernance(page.data, page.path).owner : null,
    documents: 0,
  };
}

/** How many documents the stage holds under a bundle-relative directory. */
function countUnder(dir: string): number {
  const prefix = `${dir}/`;
  return Object.keys(readStageManifest().pages).filter((p) => p.startsWith(prefix)).length;
}

/**
 * The entries directly below a directory of the record (`""` for the root),
 * in the governed reading order — the folder's regenerated `index.md`,
 * rendered. A folder this viewer's stage does not hold lists nothing.
 */
export function entriesUnder(dir: string): RecordEntry[] {
  const byUrl = new Map(source.getPages().map((page) => [page.url, page] as const));
  return listingOf(dir, readStagedIndex(dir) ?? []).flatMap((item): RecordEntry[] => {
    if (item.kind === "folder") {
      return [
        {
          url: item.url,
          title: item.title,
          description: null,
          badge: null,
          owner: null,
          documents: countUnder(item.path),
        },
      ];
    }
    const page = byUrl.get(item.url);
    return page === undefined ? [] : [entryFor(page)];
  });
}

/** The heading of a directory's page: the index's own H1, or its humanised name. */
export function folderHeading(dir: string): string {
  const entries = readStagedIndex(dir) ?? [];
  return (
    entries[0]?.heading || (dir === "" ? appTitle : humanise(dir.slice(dir.lastIndexOf("/") + 1)))
  );
}

/** Every directory the stage holds an index for, as `/docs/...` slugs — the folder routes to export. */
export function folderSlugs(): string[][] {
  return [...stagedIndexes().keys()].map((dir) => (dir === "" ? [] : dir.split("/")));
}

/** Is this route a folder page in this viewer's stage? Returns its directory. */
export function folderOfRoute(url: string): string | null {
  const dir = dirOfRoute(url);
  return dir !== null && readStagedIndex(dir) !== null ? dir : null;
}

/** The stamp block, as the text artefacts print it: one `key: value` bullet per stamp. */
function stampBullets(): string[] {
  return [`- name: ${appName}`, ...stampLines(readStageManifest().stamps).map((l) => `- ${l}`)];
}

/**
 * The record as `llms.txt` serves it: the display title, the record's own
 * description, the stamps that connect this file to one publication, then
 * every MACHINE-admitted document in reading order.
 *
 * Here rather than in the route, because the home page shows the same index
 * to a reader. Two spellings of the record's index would be two indexes, and
 * the one on the page would be the one nobody checked.
 */
export function recordIndexText(): string {
  const lines = getMachinePages().map((page) => {
    const link = `- [${page.data.title}](${basePath}${page.url})`;
    return page.data.description ? `${link}: ${page.data.description}` : link;
  });
  const head = [`# ${appTitle}`, ""];
  if (appDescription !== null) head.push(`> ${appDescription.replace(/\s+/g, " ").trim()}`, "");
  return `${[...head, ...stampBullets(), "", "## Documents", "", ...lines].join("\n")}\n`;
}

/**
 * The record-root twin, `/md/index.md`: the index REGENERATED over the machine
 * set with the record's own generator (OKF §8 form), under the stamps. A
 * folder's index has no twin — its page is the listing — so this is the one
 * index a consumer can fetch.
 */
export function rootIndexTwin(): string {
  const pages = getMachinePages();
  const dirs = new Set<string>();
  for (const page of pages) {
    const parts = pathOf(page).split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  const generated = generateIndexes({
    title: appTitle,
    concepts: pages.map((page) => ({
      id: pathOf(page).replace(/\.md$/, ""),
      title: page.data.title,
      description: page.data.description ?? "",
      order: typeof page.data.order === "number" ? page.data.order : null,
    })),
    dirs: [...dirs],
  });
  const root = generated.get("index.md") ?? "";
  const body = root.replace(/^---\n[\s\S]*?\n---\n\n?/, "");
  return `---\nokf_version: "0.2"\n${stampLines(readStageManifest().stamps).join("\n")}\n---\n\n${body}`;
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

/**
 * Every page's badge label, keyed by route — the small map the search dialog
 * needs on the client.
 *
 * Search was the last surface where a withdrawn document and the one that
 * replaced it looked identical, and its snippet quotes the withdrawn figure
 * (research/site-design.md F3). The dialog runs in the browser over a static
 * index that has no field for it, so the map travels as a prop instead: a few
 * dozen bytes per badged document, and nothing at all for a record whose
 * documents are all current.
 */
export function badgeByUrl(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const page of source.getPages()) {
    const label = badgeLabel(stagePageOf(pathOf(page))?.badge ?? null);
    if (label !== null) out[page.url] = label;
  }
  return out;
}
