"use client";

import { getBreadcrumbItemsFromPath } from "fumadocs-core/breadcrumb";
import Link from "fumadocs-core/link";
import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";
import type { BreadcrumbProps } from "fumadocs-ui/layouts/docs/page/slots/breadcrumb";
import { ChevronRight, Home } from "lucide-react";
import { Fragment, type ReactElement } from "react";

/**
 * Where this document sits — on EVERY document, including the top-level ones.
 *
 * The shell's own breadcrumb renders the folders above a page and nothing
 * else, so it appeared on `/docs/surfaces/for-agents` and was absent on
 * `/docs/installing` (measured on the built pages: two of three blank). A
 * reader clicking between them watched the block above the title appear and
 * disappear, and the pages with no trail were exactly the ones at the top of
 * the record.
 *
 * The shell has an `includeRoot` option that looks like the fix and is not:
 * it only fires for a folder marked `root: true` in the page tree, which a
 * plain `knowledge/` tree has none of (fumadocs-core 16.14.5, breadcrumb.js —
 * the `item.root` branch). So the root is prepended here instead.
 *
 * The trail ENDS IN THE PAGE (owner's call, 2026-08-24). The first cut left it
 * out — the title is the h1 directly beneath, so ending the trail in the
 * heading you are already reading looked like a duplicate. It reads the other
 * way round on a real record: without the page the trail is folders only, so a
 * top-level document got a single word and no sense of place at all.
 *
 * The root is a HOME ICON, not the record's name (owner's call, 2026-08-24).
 * The name is a project slug — `quiz-demo` — which is an identifier rather
 * than a place, and the record's real name is already at the top of the
 * sidebar. The name stays as the icon's accessible label, so a screen reader
 * hears where the link goes.
 */
export function RecordBreadcrumb({
  includeRoot: _includeRoot,
  includePage: _includePage,
  includeSeparator,
  ...props
}: BreadcrumbProps): ReactElement {
  const path = useTreePath();
  const { root } = useTreeContext();
  const trail = getBreadcrumbItemsFromPath(root, path, { includePage: true, includeSeparator });

  return (
    <nav {...props} aria-label="Breadcrumb" className={`ksor-breadcrumb ${props.className ?? ""}`}>
      {/* The record's front door is `/`, not `/docs` — the home page wears the
          same shell (components/record-shell.tsx) and there is no `/docs`
          route at all. Linking there served a 404 from the first item of every
          page's breadcrumb; caught by walking the built routes. */}
      <Link className="ksor-breadcrumb-home" href="/" aria-label={`${root.name} home`}>
        <Home className="size-4" aria-hidden />
      </Link>
      {trail.map((item, index) => (
        <Fragment key={index}>
          <ChevronRight className="ksor-breadcrumb-sep size-3.5 shrink-0" aria-hidden />
          {item.url && index < trail.length - 1 ? (
            <Link className="ksor-breadcrumb-step" href={item.url}>
              {item.name}
            </Link>
          ) : (
            // The document itself: never a link to the page you are on.
            <span className="ksor-breadcrumb-here" aria-current="page">
              {item.name}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
