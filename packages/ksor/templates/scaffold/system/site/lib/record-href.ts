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
 * Otherwise the href is handed back UNCHANGED, which is what carries assets,
 * external urls and same-page anchors through untouched.
 *
 * Two cases fall through to a link this build cannot serve, and both are
 * deliberate. A per-viewer build stages a SUBSET, so a link to a concept this
 * viewer may not see must not be rewritten — inventing a route would publish
 * the existence of a document the viewer was not given, which is exactly what
 * the audience rule withholds. And a link to a concept that exists in no build
 * is an authoring mistake the CHECKER owns: rewriting it here would hide it
 * from the one thing that can name the file and the line.
 */
export function recordHref(
  href: string | undefined,
  sourceId: string,
  routes: ReadonlyMap<string, string>,
): string | undefined {
  if (href === undefined) return href;
  // Classified on the value a BROWSER sees. Parsing a URL strips leading C0
  // controls and spaces (WHATWG URL §4.4), so `\tjavascript:…` is a scheme to
  // everything that follows the link and was not one to this test. An href
  // carrying a scheme was therefore read as a record link — and one whose
  // mangled path happened to resolve (`\tjavascript:x/../policies/travel`) was
  // rewritten into a route of this build.
  //
  // Defence in depth rather than a live hole: the same regex runs in
  // `record/citations.ts`, over the raw markdown, so a link written this way is
  // classified as a record link there too, resolves to nothing, and the build
  // refuses it `ksor-link-dead` before the page exists. This makes the guard
  // mean what it says on the value it is guarding.
  // eslint-disable-next-line no-control-regex -- the control range is the point
  const probe = href.replace(/^[\u0000-\u0020]+/, "");
  // A same-page anchor, a protocol-relative url, and anything carrying a
  // scheme (`https:`, `mailto:`) are not record links and are never touched.
  if (probe === "" || probe.startsWith("#") || probe.startsWith("//")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) return href;
  const id = resolveLink(sourceId, href);
  if (id === null) return href;
  const url = routes.get(id);
  if (url === undefined) return href;
  const hash = href.indexOf("#");
  return hash === -1 ? url : `${url}${href.slice(hash)}`;
}
