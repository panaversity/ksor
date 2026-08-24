/**
 * From a directory's regenerated `index.md` (OKF §8 form, parsed by the
 * record's `parseIndex`) to the routes this site serves — the folder page's
 * listing and the one reading order every surface shares.
 *
 * The index IS the listing: every projection regenerates its indexes from the
 * tree it was filtered to (record spec §1), so rendering the staged index is
 * rendering exactly what this viewer may see, in the generator's order —
 * concepts by `order:` then title, then folders by their first concept. The
 * sidebar, `llms.txt` and the folder pages all take their order from here,
 * which is what makes it ONE reading order rather than three.
 *
 * Pure: no framework, no filesystem, so the rule is unit-tested where the
 * package tests live.
 */

/**
 * One bullet of a parsed index: exactly the three fields this module reads.
 *
 * Structural rather than the record's own `IndexEntry`, so this rule keeps no
 * relative import at all — it is unit-tested from the package
 * (packages/ksor/src/index-routes.test.ts), whose Node-ESM program cannot
 * typecheck the extensionless specifiers the site's modules must use, and the
 * record's `parseIndex` output satisfies this by shape. Widening is impossible
 * in the dangerous direction: a field dropped from the record's type fails at
 * the call site.
 */
export interface IndexBullet {
  readonly title: string;
  readonly href: string;
  readonly description: string | null;
}

export interface Listing {
  readonly kind: "concept" | "folder";
  readonly title: string;
  /** The route, without any base path: `/docs/policies/x` or `/docs/policies`. */
  readonly url: string;
  /** Bundle-relative: `policies/x.md` for a concept, `policies` for a folder. */
  readonly path: string;
  readonly description: string | null;
}

/** The route of a bundle-relative directory: `""` → `/docs`, `a/b` → `/docs/a/b`. */
export function folderRoute(dir: string): string {
  return dir === "" ? "/docs" : `/docs/${dir}`;
}

/** The route of a bundle-relative concept path: `a/b.md` → `/docs/a/b`. */
export function conceptRoute(conceptPath: string): string {
  return `/docs/${conceptPath.replace(/\.md$/, "")}`;
}

/** The bundle-relative directory a route names, or null when it is not under `/docs`. */
export function dirOfRoute(url: string): string | null {
  if (url === "/docs") return "";
  return url.startsWith("/docs/") ? url.slice("/docs/".length).replace(/\/$/, "") : null;
}

/**
 * The listing of one directory from its parsed index. `dir` is bundle-relative
 * (`""` at the root). A bullet's href is either `file.md` (a concept) or
 * `name/` (a folder) — the two shapes the generator writes.
 */
export function listingOf(dir: string, entries: readonly IndexBullet[]): Listing[] {
  const prefix = dir === "" ? "" : `${dir}/`;
  return entries.flatMap((entry): Listing[] => {
    const href = decodeURIComponent(entry.href);
    if (href.endsWith("/")) {
      const path = `${prefix}${href.slice(0, -1)}`;
      return [
        { kind: "folder", title: entry.title, url: folderRoute(path), path, description: null },
      ];
    }
    if (!href.endsWith(".md")) return [];
    const path = `${prefix}${href}`;
    return [
      {
        kind: "concept",
        title: entry.title,
        url: conceptRoute(path),
        path,
        description: entry.description,
      },
    ];
  });
}

/**
 * Every route in reading order, root first, folders entered where their bullet
 * sits: the depth-first walk of the indexes. `indexes` maps a bundle-relative
 * directory to its parsed index; a folder bullet whose index is missing is
 * listed and not entered.
 */
export function readingOrder(indexes: ReadonlyMap<string, readonly IndexBullet[]>): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const item of listingOf(dir, indexes.get(dir) ?? [])) {
      out.push(item.url);
      if (item.kind === "folder") walk(item.path);
    }
  };
  walk("");
  return out;
}
