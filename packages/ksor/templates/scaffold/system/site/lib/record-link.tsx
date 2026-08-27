import type { ComponentProps, FC } from "react";
import type { LoaderConfig, LoaderOutput, Page } from "fumadocs-core/source";
import { createRelativeLink } from "fumadocs-ui/mdx";

import { conceptIdOfPath } from "./governance";
import { recordHref } from "./record-href";

/**
 * The MDX anchor for a governed document: the shell's relative link, with the
 * record's own link rule in front of it (lib/record-href.ts, which carries the
 * why).
 *
 * The routes are the pages of THIS build, so the subset a per-viewer build
 * staged is exactly the set a link may resolve into.
 */
export function recordLink<C extends LoaderConfig>(
  source: LoaderOutput<C>,
  page: Page | C["page"],
): FC<ComponentProps<"a">> {
  const Relative = createRelativeLink(source, page);
  const routes = new Map(source.getPages().map((p) => [conceptIdOfPath(p.path), p.url] as const));
  const sourceId = conceptIdOfPath(page.path);
  return function RecordLink(props: ComponentProps<"a">) {
    return <Relative {...props} href={recordHref(props.href, sourceId, routes)} />;
  };
}
