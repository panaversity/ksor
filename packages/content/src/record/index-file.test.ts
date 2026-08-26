import { describe, expect, it } from "vitest";

import { generateIndexes, humanise, type IndexInput, parseIndex } from "./index-file.js";
import { parseConcept } from "./profile.js";

const INPUT: IndexInput = {
  title: "Acme",
  concepts: [
    { id: "what-is-a-ksor", title: "What is a KSoR", description: "One sentence.", order: 1 },
    { id: "governance-ladder", title: "Governance ladder", description: "Rungs.", order: null },
    { id: "surfaces/overview", title: "Surfaces", description: "The projections.", order: 2 },
    { id: "surfaces/for-people", title: "The human surface", description: "Pages.", order: 1 },
    { id: "surfaces/for-agents", title: "The agent surface", description: "MCP.", order: 2 },
    { id: "surfaces/agents/tools", title: "Tools", description: "Three of them.", order: null },
    { id: "policies/purchase-approval", title: "Purchase approval", description: "Who.", order: 5 },
    { id: "zed/deep/leaf", title: "Leaf", description: "Deep.", order: null },
  ],
  // an empty directory the walker found, which must produce no index and no bullet
  dirs: ["surfaces", "surfaces/agents", "policies", "zed", "zed/deep", "empty"],
};

/**
 * The golden: OKF §8 form, ONE bullet list — concepts and folders interleaved
 * by `order:`, ties broken on the name the way `ORDER_CASES` says (decision
 * 18). A folder takes the lowest order among the concepts anywhere BENEATH it,
 * so `surfaces/` sorts at 1 through `for-people.md` and `zed/` is unordered.
 */
const ROOT = `---
okf_version: "0.2"
---

# Acme

* [Surfaces](surfaces/)
* [What is a KSoR](what-is-a-ksor.md) - One sentence.
* [Policies](policies/)
* [Governance ladder](governance-ladder.md) - Rungs.
* [Zed](zed/)
`;

const SURFACES = `# Surfaces

* [The human surface](for-people.md) - Pages.
* [The agent surface](for-agents.md) - MCP.
* [Surfaces](overview.md) - The projections.
* [Agents](agents/)
`;

describe("generateIndexes — OKF §8 form (record spec §7.4, build spec §1 step 1)", () => {
  const out = generateIndexes(INPUT);

  it("the root carries okf_version as its only frontmatter and the instance title as heading", () => {
    expect(out.get("index.md")).toBe(ROOT);
  });

  it("a subdirectory carries no frontmatter and the humanised directory name", () => {
    expect(out.get("surfaces/index.md")).toBe(SURFACES);
    expect(out.get("surfaces/agents/index.md")).toBe(
      "# Agents\n\n* [Tools](tools.md) - Three of them.\n",
    );
  });

  it("an empty directory gets no index and no bullet; a directory with only a subdirectory still gets one", () => {
    expect(out.has("empty/index.md")).toBe(false);
    expect(out.get("zed/index.md")).toBe("# Zed\n\n* [Deep](deep/)\n");
    expect([...out.keys()].sort()).toEqual([
      "index.md",
      "policies/index.md",
      "surfaces/agents/index.md",
      "surfaces/index.md",
      "zed/deep/index.md",
      "zed/index.md",
    ]);
  });

  it("folder bullets order by the lowest order among the folder's concepts, then name; unordered last", () => {
    // surfaces (min 1) < policies (min 5) < zed (unordered)
    const root = out.get("index.md") ?? "";
    expect(root.indexOf("(surfaces/)")).toBeLessThan(root.indexOf("(policies/)"));
    expect(root.indexOf("(policies/)")).toBeLessThan(root.indexOf("(zed/)"));
  });

  it("a folder INTERLEAVES with the documents beside it — one reading order, not files-then-folders", () => {
    const root = out.get("index.md") ?? "";
    // surfaces/ is order 1 and what-is-a-ksor.md is order 1: they tie, and the
    // name breaks it — so the folder lands between two root documents rather
    // than behind both of them.
    expect(root.indexOf("(surfaces/)")).toBeLessThan(root.indexOf("(what-is-a-ksor.md)"));
    expect(root.indexOf("(what-is-a-ksor.md)")).toBeLessThan(root.indexOf("(policies/)"));
    expect(root.indexOf("(policies/)")).toBeLessThan(root.indexOf("(governance-ladder.md)"));
  });

  it("a folder's key counts concepts anywhere BENEATH it, not only its own", () => {
    // `alpha/` holds no concept itself; its ordered document is one level down.
    // Folding over its own concepts made it unordered here and first in the
    // MCP outline — the two surfaces listing opposite documents first.
    const nested = generateIndexes({
      title: "T",
      concepts: [
        { id: "alpha/deep/a", title: "A", description: "d.", order: 1 },
        { id: "beta/b", title: "B", description: "d.", order: 2 },
      ],
      dirs: ["alpha", "alpha/deep", "beta"],
    });
    expect(nested.get("index.md")).toContain("* [Alpha](alpha/)\n* [Beta](beta/)\n");
  });

  it("the same input twice yields byte-identical output", () => {
    expect(generateIndexes(INPUT)).toEqual(out);
  });

  it("a title with markdown-significant characters is written as-is: the record's map, not a rendering", () => {
    const one = generateIndexes({
      title: "T",
      concepts: [{ id: "a", title: "A [b] (c)", description: "d - e", order: null }],
      dirs: [],
    });
    expect(one.get("index.md")).toContain("* [A [b] (c)](a.md) - d - e\n");
  });
});

/**
 * The generator and the parser are two halves of ONE file format, so they agree
 * with each other on any bytes at all — which is why `ksor-index-stale` stays
 * green over an index whose bullets nothing can read. What has to hold instead
 * is that a concept the PROFILE accepts survives its own bullet: one that does
 * not is dropped from the index, the sidebar and the reading order while it
 * keeps its route and stays served by the door — one surface silently losing
 * what another still serves, which is decision 19's failure mode.
 */
describe("a concept the profile accepts survives its own index bullet", () => {
  const CASES = [
    "Purchase approval",
    "A [b] (c)",
    "Dashes - and \u2014 dashes",
    "\u00dcn\u00efcode, \u2018quotes\u2019 and 30% off",
    "Multi\nline",
    "Folded, so it ends in a newline\n",
  ] as const;

  it.each(CASES.flatMap((v) => [["title", v] as const, ["description", v] as const]))(
    "%s: %j",
    (key, value) => {
      const r = parseConcept("knowledge/a.md", {
        type: "Document",
        title: "T",
        description: "D",
        status: "draft",
        ksor: { audience: ["public"] },
        [key]: value,
      });
      if (!r.ok) {
        expect(
          r.refusals.map((x) => x.slug),
          JSON.stringify(r.refusals),
        ).toContain("ksor-one-line-form");
        expect(value, "only a line break may cost a concept its bullet").toMatch(/[\r\n]/);
        return;
      }
      const { id, title, description, order } = r.concept;
      const index = generateIndexes({
        title: "T",
        concepts: [{ id, title, description, order }],
        dirs: [],
      });
      expect(parseIndex(index.get("index.md") ?? "")).toEqual([
        { heading: "T", title, href: "a.md", description },
      ]);
    },
  );
});

describe("humanise", () => {
  it("turns a directory name into a heading: separators to spaces, first letter capitalised", () => {
    expect(humanise("purchase-policies")).toBe("Purchase policies");
    expect(humanise("for_agents")).toBe("For agents");
    expect(humanise("hr")).toBe("Hr");
  });
});
