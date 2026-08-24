/**
 * What a link inside a document names, as a route of THIS build.
 *
 * OKF §6.1 allows two forms and the record spec (§2.3) carries both:
 * bundle-absolute (`/policies/x.md`, resolved against `knowledge/`) and
 * relative (`x.md`, `./x.md`, `../x.md`, against the document's own
 * directory), with `.md` optional in each. The shell resolves only the `./`
 * and `../` forms (fumadocs-core 16.14.5, `resolveHref` returns anything else
 * untouched), so a bundle-absolute link left the record's frame entirely and a
 * bare `x.md` was resolved by the browser against the page's ROUTE rather than
 * its directory: both 404'd from every page, found live 2026-08-25 as prefetch
 * failures in the console.
 *
 * So the record's OWN resolver decides — `resolveLink` is the same function the
 * checker uses for the widening rule, which is what makes a link the checker
 * accepted a link this site can serve.
 *
 * Pure, and the whole decision, so it is testable without a site install
 * (packages/ksor/src/record-href.integration.test.ts).
 */
import { resolveLink } from "../record/citations";

/**
 * `href` as this build serves it: a route when the link names a concept of this
 * build, and the author's own text otherwise.
 *
 * Otherwise is not a failure. A per-viewer build stages a SUBSET, so a link to
 * a concept this viewer may not see must stay as written rather than become a
 * link to a page that does not exist — and the same fall-through carries
 * assets, external urls and same-page anchors untouched.
 */
export function recordHref(
  href: string | undefined,
  sourceId: string,
  routes: ReadonlyMap<string, string>,
): string | undefined {
  // A same-page anchor, a protocol-relative url, and anything carrying a
  // scheme (`https:`, `mailto:`) are not record links and are never touched.
  if (href === undefined || href === "" || href.startsWith("#") || href.startsWith("//")) {
    return href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const id = resolveLink(sourceId, href);
  if (id === null) return href;
  const url = routes.get(id);
  if (url === undefined) return href;
  const hash = href.indexOf("#");
  return hash === -1 ? url : `${url}${href.slice(hash)}`;
}
