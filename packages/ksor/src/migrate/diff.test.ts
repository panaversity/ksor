import { describe, expect, it } from "vitest";

import { renderDiff, unifiedDiff } from "./diff.js";

describe("unifiedDiff", () => {
  it("says nothing about an unchanged file", () => {
    expect(unifiedDiff({ path: "a.md", before: "x\n", after: "x\n" })).toBe("");
  });

  it("names /dev/null on the side that does not exist", () => {
    expect(unifiedDiff({ path: "a.md", before: null, after: "x\n" })).toBe(
      "--- /dev/null\n+++ b/a.md\n@@ -1,0 +1,1 @@\n+x\n",
    );
    expect(unifiedDiff({ path: "a.md", before: "x\n", after: null })).toBe(
      "--- a/a.md\n+++ /dev/null\n@@ -1,1 +1,0 @@\n-x\n",
    );
  });

  it("keeps three lines of context around a change", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n") + "\n";
    const after = before.replace("5", "five");
    expect(unifiedDiff({ path: "a.md", before, after })).toBe(
      [
        "--- a/a.md",
        "+++ b/a.md",
        "@@ -2,7 +2,7 @@",
        " 2",
        " 3",
        " 4",
        "-5",
        "+five",
        " 6",
        " 7",
        " 8",
        "",
      ].join("\n"),
    );
  });

  it("does not treat a trailing newline as one more line", () => {
    expect(unifiedDiff({ path: "a.md", before: "a\nb\n", after: "a\nb\nc\n" })).toContain(
      "@@ -1,2 +1,3 @@",
    );
  });

  it("renders every change in path order and drops the unchanged ones", () => {
    const out = renderDiff([
      { path: "b.md", before: "1\n", after: "2\n" },
      { path: "same.md", before: "1\n", after: "1\n" },
      { path: "a.md", before: null, after: "1\n" },
    ]);
    expect(out.indexOf("b/a.md")).toBeLessThan(out.indexOf("b/b.md"));
    expect(out).not.toContain("same.md");
  });
});
