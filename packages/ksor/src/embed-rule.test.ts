/**
 * A marked link -> a click-to-load frame.
 *
 * The half worth testing hardest is what this REFUSES. Every ordinary link it
 * reframed by mistake would put a third party's page inside the record,
 * announced as part of it — which is the one thing an embed must never do
 * without an author asking for it in the document.
 */
import { describe, expect, it } from "vitest";

import {
  EMBED_CASES,
  EMBED_TITLE,
  hostOf,
  matchEmbed,
  publicSimPath,
  recordDirOf,
  rehypeEmbeds,
  servedSimUrl,
  SIM_SUFFIX,
} from "../templates/scaffold/system/site/lib/embed-rule.js";

describe("the rule", () => {
  for (const testCase of EMBED_CASES) {
    it(`${testCase.title === undefined ? "no title" : JSON.stringify(testCase.title)} ${testCase.url} -> ${testCase.embeds ? "frame" : "link"}`, () => {
      expect(matchEmbed(testCase.url, testCase.title) !== null).toBe(testCase.embeds);
    });
  }

  it("opts in on the link TITLE, so no ordinary link is reframed", () => {
    expect(EMBED_TITLE).toBe("embed");
    expect(matchEmbed("https://example.org/sim", "embed")).not.toBeNull();
    expect(matchEmbed("https://example.org/sim", undefined)).toBeNull();
  });

  it("surfaces the host, because that is what the reader consents to", () => {
    expect(hostOf("https://agentfactory.panaversity.org/sims/goal-loop?v=3")).toBe(
      "agentfactory.panaversity.org",
    );
    expect(hostOf("not a url")).toBeNull();
  });
});

/** hast nodes, hand-built — the shapes the plugin actually meets. */
function paragraph(children: readonly unknown[]): Record<string, unknown> {
  return { type: "element", tagName: "p", properties: {}, children };
}
function link(url: string, label: string, title?: string): Record<string, unknown> {
  return {
    type: "element",
    tagName: "a",
    properties: title === undefined ? { href: url } : { href: url, title },
    children: [{ type: "text", value: label }],
  };
}
function tree(children: readonly unknown[]): Record<string, unknown> {
  return { type: "root", children };
}

describe("the plugin", () => {
  it("replaces a lone marked link with an Embed", () => {
    const root = tree([paragraph([link("https://example.org/sim", "Play it", "embed")])]);
    rehypeEmbeds()(root as never);

    const node = (root.children as Record<string, unknown>[])[0]!;
    expect(node.type).toBe("mdxJsxFlowElement");
    expect(node.name).toBe("Embed");
    const attributes = node.attributes as { name: string; value: string }[];
    const byName = Object.fromEntries(attributes.map((a) => [a.name, a.value]));
    expect(byName.url).toBe("https://example.org/sim");
    // The link text is the label, so the frame and the link out say the same
    // thing the author wrote.
    expect(byName.label).toBe("Play it");
    expect(byName.host).toBe("example.org");
  });

  it("leaves a marked link that shares its paragraph alone", () => {
    const root = tree([
      paragraph([
        { type: "text", value: "See " },
        link("https://example.org/sim", "Play it", "embed"),
      ]),
    ]);
    rehypeEmbeds()(root as never);

    expect((root.children as Record<string, unknown>[])[0]!.tagName).toBe("p");
  });

  it("leaves an ordinary link alone", () => {
    const root = tree([paragraph([link("https://example.org/sim", "Play it")])]);
    rehypeEmbeds()(root as never);

    expect((root.children as Record<string, unknown>[])[0]!.tagName).toBe("p");
  });

  it("reaches a link nested below the root", () => {
    const root = tree([
      {
        type: "element",
        tagName: "div",
        properties: {},
        children: [paragraph([link("https://example.org/sim", "Play it", "embed")])],
      },
    ]);
    rehypeEmbeds()(root as never);

    const div = (root.children as Record<string, unknown>[])[0]!;
    expect((div.children as Record<string, unknown>[])[0]!.name).toBe("Embed");
  });
});

/**
 * A sim carried IN the record.
 *
 * The cross-origin arm above is the one that cannot be relied on: every sim
 * this was built for answers `x-frame-options: SAMEORIGIN` (measured
 * 2026-08-24, all seven), so a frame pointed at their host can never render.
 * Carrying the page and serving it from here is what makes the affordance
 * work at all — and it is also what keeps the zero-external-request guarantee.
 */
describe("a sim carried in the record", () => {
  it("is served under the record path, so two documents may each own one name", () => {
    expect(publicSimPath("loop-engineering/goal-loop" + SIM_SUFFIX)).toBe(
      "loop-engineering/goal-loop.html",
    );
    expect(publicSimPath("goal-loop" + SIM_SUFFIX)).toBe("goal-loop.html");
    expect(servedSimUrl("loop-engineering", "goal-loop" + SIM_SUFFIX)).toBe(
      "/sims/loop-engineering/goal-loop.html",
    );
    expect(servedSimUrl("", "goal-loop" + SIM_SUFFIX)).toBe("/sims/goal-loop.html");
  });

  it("finds the document's place under BOTH record roots", () => {
    // A record that declares `audiences:` or carries a takedown is read from
    // the staged copy; every other record is read from `knowledge/` directly.
    // Keying on the staged one alone dropped the directory from every url on
    // the common record (found live 2026-08-24).
    expect(recordDirOf("/r/system/site/.staged-knowledge/loop-engineering/index.md")).toBe(
      "loop-engineering",
    );
    expect(recordDirOf("/r/knowledge/loop-engineering/index.md")).toBe("loop-engineering");
    expect(recordDirOf("/r/knowledge/index.md")).toBe("");
    expect(recordDirOf(undefined)).toBe("");
  });

  it("names itself as the record's own, not as a third party", () => {
    expect(matchEmbed("goal-loop" + SIM_SUFFIX, EMBED_TITLE)?.host).toBe("this record");
    expect(matchEmbed("https://example.org/x", EMBED_TITLE)?.host).toBe("example.org");
  });

  it("rewrites the link to where the build serves it", () => {
    const root = tree([paragraph([link("goal-loop" + SIM_SUFFIX, "Play it", "embed")])]);
    rehypeEmbeds()(root as never, { path: "/r/knowledge/loop-engineering/index.md" });

    const node = (root.children as Record<string, unknown>[])[0]!;
    const attributes = node.attributes as { name: string; value: string }[];
    const byName = Object.fromEntries(attributes.map((a) => [a.name, a.value]));
    expect(byName.url).toBe("/sims/loop-engineering/goal-loop.html");
    // The panel says a very different thing for a page the record carries.
    expect(byName.owned).toBe("true");
  });
});
