/**
 * WHERE the teaching aid sits in a document: after its introduction.
 *
 * The deck used to render above the document, between the governance row and
 * the first word of prose. That reads as a slot in the page's furniture rather
 * than as part of the document, and on a long lesson it puts a fourteen-slide
 * deck in front of the paragraph that says what the lesson is.
 *
 * The rule is the document's own shape: a document's INTRODUCTION is
 * everything before its first `##` section, so the aid goes immediately before
 * that heading. It needs no marker in the record and no frontmatter key — the
 * headings the author already wrote are the structure. A document with no
 * sections has no such seam, and the aid follows its prose instead.
 *
 * This is where the imported course put its own `## Teaching Aid` by hand:
 * after the intro material, immediately before Part 1.
 *
 * The marker goes into DOCUMENTS only. `<doc>.summary.md` goes through the
 * same MDX pipeline (source.config.ts, the `summaries` collection) and is
 * rendered with the page's own component map, which does not carry a teaching
 * aid — so marking one threw "Expected component `TeachingAid` to be defined"
 * and served a 500 for every document that has a summary. Found live in the
 * dev server, on the first page with one.
 *
 * What counts as an attachment is HANDED IN rather than imported: this file
 * has to stay import-free so the repo's own tests can take it on its own (a
 * relative import here needs a `.js` extension for tsc that Next's resolver
 * then rejects). Handing it in keeps lib/attachment-rule.ts the one place the
 * suffix list lives — a second copy here is exactly the drift the attachment
 * rule is written to prevent.
 */

/** The heading level that starts a section. `##` — `#` is the page title. */
export const SECTION_HEADING = "h2";

/** The component the site swaps in for the marker. */
export const TEACHING_AID_ELEMENT = "TeachingAid";

export interface TeachingAidOptions {
  /** lib/attachment-rule.ts's `isAttachment`, handed in — see above. */
  readonly isAttachment: (baseName: string) => boolean;
}

interface AidNode {
  type: string;
  tagName?: string;
  children?: AidNode[];
  name?: string;
  attributes?: unknown[];
}

/**
 * The index in `children` the aid belongs at: before the first `h2`, or after
 * everything when the document has no sections.
 */
export function teachingAidIndex(children: readonly AidNode[]): number {
  const first = children.findIndex(
    (child) => child.type === "element" && child.tagName === SECTION_HEADING,
  );
  return first === -1 ? children.length : first;
}

/**
 * Rehype plugin: put a `<TeachingAid />` marker where the aid belongs.
 *
 * The marker is ALWAYS inserted; the component the page supplies renders null
 * when the document carries no deck. That keeps the decision about whether
 * there is an aid in one place (`slidesFor`, on the server) instead of
 * splitting it between a plugin and a component.
 *
 * Rehype rather than remark for the reason lib/alert-rule.ts records: the
 * record's markdown is serialized from the mdast, so a marker inserted there
 * would appear in `/md/` and `llms-full.txt`, publishing a component of this
 * site to the agent surface.
 */
export function rehypeTeachingAid(
  options: TeachingAidOptions,
): (tree: AidNode, file: { path?: string }) => void {
  return (tree: AidNode, file: { path?: string }): void => {
    const name = (file.path ?? "").split(/[/\\]/).pop() ?? "";
    if (options.isAttachment(name)) return;

    const children = tree.children;
    if (!children) return;
    children.splice(teachingAidIndex(children), 0, {
      type: "mdxJsxFlowElement",
      name: TEACHING_AID_ELEMENT,
      attributes: [],
      children: [],
    });
  };
}
