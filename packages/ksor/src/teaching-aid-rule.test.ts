/**
 * WHERE the teaching aid goes: after the document's introduction.
 *
 * The rule is the document's own shape — everything before its first `##` is
 * the introduction — so these cases are about headings, not about decks.
 */
import { describe, expect, it } from "vitest";

import { isAttachment } from "../templates/scaffold/system/site/lib/attachment-rule.js";
import {
  SECTION_HEADING,
  TEACHING_AID_ELEMENT,
  rehypeTeachingAid,
  teachingAidIndex,
} from "../templates/scaffold/system/site/lib/teaching-aid-rule.js";

const el = (tagName: string): Record<string, unknown> => ({ type: "element", tagName });
const text = (): Record<string, unknown> => ({ type: "text", value: "\n" });

describe("the rule", () => {
  it("puts the aid before the first section", () => {
    expect(teachingAidIndex([el("p"), el("p"), el("h2"), el("p")] as never)).toBe(2);
  });

  it("ignores subheadings inside the introduction", () => {
    // A long intro often carries h3s of its own — the imported course has two
    // before its first `##`. They are part of the introduction, not sections.
    expect(teachingAidIndex([el("p"), el("h3"), el("p"), el("h2")] as never)).toBe(3);
  });

  it("puts it first when the document opens on a section", () => {
    expect(teachingAidIndex([el("h2"), el("p")] as never)).toBe(0);
  });

  it("puts it last when the document has no sections at all", () => {
    expect(teachingAidIndex([el("p"), el("p")] as never)).toBe(2);
  });

  it("is empty-safe", () => {
    expect(teachingAidIndex([])).toBe(0);
  });

  it("counts h2 and nothing else as a section", () => {
    expect(SECTION_HEADING).toBe("h2");
    expect(teachingAidIndex([el("h1"), el("h4"), el("h2")] as never)).toBe(2);
  });
});

describe("the plugin", () => {
  const run = (children: unknown[], file = "returns.md"): Record<string, unknown>[] => {
    const tree = { type: "root", children };
    rehypeTeachingAid({ isAttachment })(tree as never, { path: `/knowledge/${file}` });
    return tree.children as Record<string, unknown>[];
  };

  it("inserts the marker, and only one", () => {
    const out = run([el("p"), el("h2"), el("p")]);
    const markers = out.filter((node) => node.name === TEACHING_AID_ELEMENT);
    expect(markers).toHaveLength(1);
    expect(out.indexOf(markers[0]!)).toBe(1);
  });

  it("keeps every original node, in order", () => {
    const nodes = [el("p"), text(), el("h2"), el("p")];
    const out = run([...nodes]);
    expect(out.filter((node) => node.name !== TEACHING_AID_ELEMENT)).toEqual(nodes);
  });

  it("leaves a tree with no children alone", () => {
    const tree = { type: "root" };
    rehypeTeachingAid({ isAttachment })(tree as never, { path: "/knowledge/returns.md" });
    expect(tree).toEqual({ type: "root" });
  });

  // A summary goes through the SAME MDX pipeline and is rendered with a
  // component map that has no teaching aid, so a marker there threw
  // "Expected component `TeachingAid` to be defined" and served a 500 for
  // every document carrying a summary (found live in `pnpm dev`).
  it("never marks an attachment", () => {
    for (const attachment of ["returns.summary.md", "returns.summary.mdx"]) {
      const out = run([el("p"), el("h2")], attachment);
      expect(
        out.some((node) => node.name === TEACHING_AID_ELEMENT),
        `marked ${attachment}`,
      ).toBe(false);
    }
  });

  it("marks a document whose own name merely contains the word", () => {
    const out = run([el("p"), el("h2")], "summary.md");
    expect(out.some((node) => node.name === TEACHING_AID_ELEMENT)).toBe(true);
  });
});
