import { describe, expect, it } from "vitest";

import { generateIndexes, humanise, type IndexInput } from "./index-file.js";

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

/** The golden: OKF §8 form, concept bullets by order then title, then folder bullets by lowest order then name. */
const ROOT = `---
okf_version: "0.2"
---

# Acme

* [What is a KSoR](what-is-a-ksor.md) - One sentence.
* [Governance ladder](governance-ladder.md) - Rungs.
* [Surfaces](surfaces/)
* [Policies](policies/)
* [Zed](zed/)
`;

const SURFACES = `# Surfaces

* [The human surface](for-people.md) - Pages.
* [Surfaces](overview.md) - The projections.
* [The agent surface](for-agents.md) - MCP.
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

describe("humanise", () => {
  it("turns a directory name into a heading: separators to spaces, first letter capitalised", () => {
    expect(humanise("purchase-policies")).toBe("Purchase policies");
    expect(humanise("for_agents")).toBe("For agents");
    expect(humanise("hr")).toBe("Hr");
  });
});
