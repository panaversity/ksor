/**
 * GitHub alert syntax -> fumadocs callout.
 *
 * The half worth testing hardest is what this REFUSES: every ordinary
 * blockquote it converted by mistake would be a change to what the record
 * appears to say, made by the site rather than by an author.
 */
import { describe, expect, it } from "vitest";

import {
  ALERT_CASES,
  ALERT_KINDS,
  matchAlert,
  rehypeGithubAlerts,
} from "../templates/scaffold/system/site/lib/alert-rule.js";

describe("the rule", () => {
  for (const testCase of ALERT_CASES) {
    it(`${JSON.stringify(testCase.text)} -> ${testCase.type ?? "not an alert"}`, () => {
      const match = matchAlert(testCase.text);
      expect(match?.kind.type ?? null).toBe(testCase.type);
      expect(match?.kind.title ?? null).toBe(testCase.title);
    });
  }

  it("keeps the body that followed the marker", () => {
    expect(matchAlert("[!NOTE]\nThe record wins.\nAlways.")?.rest).toBe(
      "The record wins.\nAlways.",
    );
  });

  it("covers exactly GitHub's five markers, so a record renders the same there", () => {
    expect(ALERT_KINDS.map((kind) => kind.marker)).toEqual([
      "NOTE",
      "TIP",
      "IMPORTANT",
      "WARNING",
      "CAUTION",
    ]);
  });

  it("uses only types fumadocs' Callout defines", () => {
    // CalloutType in fumadocs-ui@16.14.5, dist/components/callout.d.ts. An
    // unknown value renders as plain `info` with nothing going red.
    const defined = ["info", "warn", "error", "success", "warning", "idea"];
    for (const kind of ALERT_KINDS) expect(defined).toContain(kind.type);
  });
});

/**
 * The hast a blockquote reaches the rehype phase as.
 *
 * The whitespace text nodes are not padding: hast keeps the source's newlines
 * between block children, so the first paragraph is not `children[0]` and a
 * transform that assumed it would silently convert nothing.
 */
function quote(text: string, ...rest: unknown[]): Record<string, unknown> {
  return {
    type: "element",
    tagName: "blockquote",
    children: [
      { type: "text", value: "\n" },
      {
        type: "element",
        tagName: "p",
        children: [{ type: "text", value: text }],
      },
      ...rest,
      { type: "text", value: "\n" },
    ],
  };
}

function element(tagName: string, value: string): Record<string, unknown> {
  return { type: "element", tagName, children: [{ type: "text", value }] };
}

function transform(tree: Record<string, unknown>): Record<string, unknown> {
  rehypeGithubAlerts()(tree as never);
  return tree;
}

const childrenOf = (node: Record<string, unknown>): Record<string, unknown>[] =>
  node.children as Record<string, unknown>[];

describe("the transform", () => {
  it("replaces the quote with a Callout carrying type and title", () => {
    const tree = transform({ type: "root", children: [quote("[!WARNING]\nSuperseded.")] });
    const node = childrenOf(tree)[0]!;

    expect(node.type).toBe("mdxJsxFlowElement");
    expect(node.name).toBe("Callout");
    expect(node.attributes).toEqual([
      { type: "mdxJsxAttribute", name: "type", value: "warn" },
      { type: "mdxJsxAttribute", name: "title", value: "Warning" },
    ]);
  });

  it("strips the marker line, so the panel shows prose and not syntax", () => {
    const tree = transform({ type: "root", children: [quote("[!NOTE]\nThe record wins.")] });
    const paragraph = childrenOf(childrenOf(tree)[0]!).find(
      (child) => child.tagName === "p",
    ) as Record<string, unknown>;

    expect(childrenOf(paragraph)[0]!.value).toBe("The record wins.");
  });

  it("drops the paragraph when the marker was alone on its line", () => {
    const body = element("p", "The body.");
    const tree = transform({ type: "root", children: [quote("[!TIP]", body)] });
    const callout = childrenOf(tree)[0]!;

    // The empty marker paragraph is gone; the real body is the only element.
    expect(childrenOf(callout).filter((child) => child.type === "element")).toEqual([body]);
  });

  it("keeps a marker-only quote's inline formatting", () => {
    const strong = element("strong", "Bold.");
    const tree = transform({
      type: "root",
      children: [
        {
          type: "element",
          tagName: "blockquote",
          children: [
            {
              type: "element",
              tagName: "p",
              children: [{ type: "text", value: "[!NOTE]\n" }, strong],
            },
          ],
        },
      ],
    });
    const paragraph = childrenOf(childrenOf(tree)[0]!)[0]!;

    expect(childrenOf(paragraph)).toEqual([strong]);
  });

  it("leaves an ordinary blockquote exactly as it was", () => {
    const tree = transform({ type: "root", children: [quote("Someone said this once.")] });
    const node = childrenOf(tree)[0]!;

    expect(node.tagName).toBe("blockquote");
    expect(node).toEqual(quote("Someone said this once."));
  });

  it("converts an alert nested inside a list item", () => {
    const tree = transform({
      type: "root",
      children: [
        {
          type: "element",
          tagName: "ul",
          children: [
            {
              type: "element",
              tagName: "li",
              children: [quote("[!CAUTION]\nMind this.")],
            },
          ],
        },
      ],
    });
    const nested = childrenOf(childrenOf(childrenOf(tree)[0]!)[0]!)[0]!;

    expect(nested.name).toBe("Callout");
  });
});
