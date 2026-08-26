import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { generateIndexes, parseIndex } from "./index-file.js";

const OKF = fileURLToPath(new URL("../../../../specs/ksor/record/okf-SPEC.md", import.meta.url));

/** Record spec §7.4: the vendored §8 example parses as a parse-side golden, and our own output round-trips. */
describe("OKF §8 index form against the vendored spec", () => {
  const spec = readFileSync(OKF, "utf8");
  const section = spec.slice(spec.indexOf("## 8. Index files"), spec.indexOf("## 9. Log files"));
  const example = /```markdown\n([\s\S]*?)```/.exec(section)?.[1] ?? "";

  it("the §8 example parses into its bullets under their headings", () => {
    expect(parseIndex(example)).toEqual([
      {
        heading: "Section / Group Heading",
        title: "Title 1",
        href: "relative-url-1",
        description: "short description of item 1",
      },
      {
        heading: "Section / Group Heading",
        title: "Title 2",
        href: "relative-url-2",
        description: "short description of item 2",
      },
      {
        heading: "Another Section",
        title: "Subdirectory",
        href: "subdir/",
        description: "short description of the subdirectory",
      },
    ]);
  });

  it("what we generate is what the parse side reads back, frontmatter stripped", () => {
    const out = generateIndexes({
      title: "Acme",
      concepts: [{ id: "a/b", title: "B", description: "Bee.", order: null }],
      dirs: ["a"],
    });
    expect(parseIndex(out.get("index.md") ?? "")).toEqual([
      { heading: "Acme", title: "A", href: "a/", description: null },
    ]);
    expect(parseIndex(out.get("a/index.md") ?? "")).toEqual([
      { heading: "A", title: "B", href: "b.md", description: "Bee." },
    ]);
  });
});
