import { describe, expect, it } from "vitest";

import { checkRecord } from "./check.js";
import { checkFootnotes, linkTargets, resolveLink } from "./citations.js";

describe("checkFootnotes — record spec §2.3", () => {
  const P = "knowledge/policies/x.md";

  it("a reference and a definition whose label is a sources[].id pass", () => {
    const body = "Needs a signature. [^fin-2024]\n\n[^fin-2024]: Finance handbook 2024, §3.\n";
    expect(checkFootnotes(P, body, ["fin-2024"])).toEqual([]);
  });

  it("ksor-footnote-unkeyed: an unmatched reference, and an unmatched definition, each by label", () => {
    const refOnly = checkFootnotes(P, "Claim. [^nope]\n", ["fin-2024"]);
    expect(refOnly.map((r) => r.slug)).toEqual(["ksor-footnote-unkeyed"]);
    expect(refOnly[0]?.why).toMatch(/\[\^nope\]/);
    const defOnly = checkFootnotes(P, "[^orphan]: text\n", ["fin-2024"]);
    expect(defOnly.map((r) => r.slug)).toEqual(["ksor-footnote-unkeyed"]);
    expect(defOnly[0]?.why).toMatch(/definition/);
  });

  it("a label is reported once however often it is used; code is not prose", () => {
    const body = "A [^x] and B [^x].\n\n```\n[^inside-code]\n```\n";
    expect(checkFootnotes(P, body, []).map((r) => r.why)).toHaveLength(1);
  });
});

describe("linkTargets and resolveLink — both OKF §6.1 forms", () => {
  it("collects inline and reference-definition destinations, skipping schemes and fragments", () => {
    const body =
      "[a](../hr/leave.md) [b](/policies/x) [c](https://x) [d](#top) [e][ref]\n\n[ref]: <sub dir/y.md>\n";
    expect(linkTargets(body)).toEqual(["../hr/leave.md", "/policies/x", "sub dir/y.md"]);
  });

  /**
   * A link whose TEXT is an image is one link with two destinations, and the
   * one that decides governance is the OUTER one. Reading only the inner
   * destination let a public document point at a restricted target and escape
   * `ksor-link-widens`, `ksor-link-dead` and `ksor-link-escapes` at once —
   * every rule that reads a link, silently, because the checker never saw the
   * link at all (found in review, 2026-08-25).
   */
  it("reads BOTH destinations of an image wrapped in a link, outer one included", () => {
    expect(linkTargets("[![chart](chart.png)](secret/plan.md)")).toEqual([
      "chart.png",
      "secret/plan.md",
    ]);
  });

  it("reads a link whose text carries brackets, an image or emphasis", () => {
    expect(linkTargets("[the [2026] policy](hr/leave.md)")).toEqual(["hr/leave.md"]);
    expect(linkTargets("[see ![i](a.png) and ![j](b.png)](c.md)")).toEqual([
      "a.png",
      "b.png",
      "c.md",
    ]);
    expect(linkTargets("[**bold** text](d.md)")).toEqual(["d.md"]);
  });

  it("still ignores destinations inside code, and an unclosed bracket names nothing", () => {
    expect(linkTargets("`[x](nope.md)`")).toEqual([]);
    expect(linkTargets("[unclosed(a.md)")).toEqual([]);
  });

  it("resolves bundle-absolute against knowledge/ and relative against the source's directory, .md optional", () => {
    expect(resolveLink("policies/x", "/hr/leave.md")).toBe("hr/leave");
    expect(resolveLink("policies/x", "/hr/leave")).toBe("hr/leave");
    expect(resolveLink("policies/x", "../hr/leave.md")).toBe("hr/leave");
    expect(resolveLink("policies/x", "y")).toBe("policies/y");
    expect(resolveLink("policies/x", "y.md#section")).toBe("policies/y");
    expect(resolveLink("x", "../../escape.md")).toBe(null);
    expect(resolveLink("policies/x", "dir/")).toBe("policies/dir");
  });
});

/**
 * What the code-stripper cannot see, no rule judges. `checkLinks` reads
 * `linkTargets`, `checkFootnotes` reads the same stripped prose, and both fail
 * OPEN: a body shape the stripper mistakes for code takes its links out of
 * reach of `ksor-link-widens`, `ksor-link-dead` and `ksor-link-escapes` at
 * once, with nothing red. So each shape is asserted twice — once on the parser,
 * and once through `checkRecord`, because the parser-level assertion alone is
 * what let the last one hide (review, 2026-08-25).
 */
describe("a misread body shape must not take its links out of the rules' reach", () => {
  const INSTANCE = `---
format: 2
name: acme
title: Acme
description: The Acme record.
---

Instructions.
`;
  const POLICY = `version: "0.1"
audiences:
  internal:
    description: Staff
approval_authorities:
  - actors: [human:cfo]
takedown_authorities:
  actors: [human:ciso]
`;
  const doc = (title: string, audience: string, body: string): string =>
    `---\ntype: Document\ntitle: ${title}\ndescription: One sentence.\nstatus: stable\ngenerated: { by: "x/1", at: 2026-08-20T09:00:00Z }\nksor:\n  audience: [${audience}]\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n---\n\n${body}`;

  /** A public document carrying `body`, in a record whose `secret/plan` is internal. */
  const refusals = (body: string): string[] =>
    checkRecord(
      {
        files: new Map([
          ["instance.md", INSTANCE],
          [".ksor/governance.yaml", POLICY],
          ["knowledge/a.md", doc("A", "public", body)],
          ["knowledge/secret/plan.md", doc("Plan", "internal", "Body.\n")],
        ]),
        dirs: ["knowledge/secret"],
      },
      { mode: "build" },
    ).refusals.map((r) => `${r.slug} ${r.path}`);

  /**
   * Finding 6. Four spaces is what CommonMark REQUIRES of a continuation
   * paragraph inside a list item, so this is ordinary markdown rather than an
   * edge case — and an indented code block cannot start there at all: it
   * cannot interrupt a paragraph, and inside an item code begins four columns
   * past the ITEM's content column, not past the line start.
   */
  it("reads a link in a list item's continuation paragraph — spaces, tab, and nested", () => {
    expect(linkTargets("- A bullet.\n\n    See [the plan](/secret/plan.md).\n")).toEqual([
      "/secret/plan.md",
    ]);
    expect(linkTargets("- A bullet.\n\n\tSee [the plan](/secret/plan.md).\n")).toEqual([
      "/secret/plan.md",
    ]);
    expect(
      linkTargets("- outer\n\n    - inner\n\n        See [the plan](/secret/plan.md).\n"),
    ).toEqual(["/secret/plan.md"]);
    // The same hole one item further down, and under a marker of another width:
    // the indent that matters is the ITEM's, so neither is a case of its own.
    expect(
      linkTargets("- A.\n\n    [one](/secret/plan.md)\n\n- B.\n\n    [two](/secret/two.md)\n"),
    ).toEqual(["/secret/plan.md", "/secret/two.md"]);
    expect(linkTargets("1.  Step one.\n\n    See [the plan](/secret/plan.md).\n")).toEqual([
      "/secret/plan.md",
    ]);
    expect(refusals("- A bullet.\n\n    See [the plan](/secret/plan.md).\n")).toEqual([
      "ksor-link-widens knowledge/a.md",
    ]);
  });

  it("keeps stripping what is really code: four columns past the item, or its own fence", () => {
    expect(linkTargets('- A bullet.\n\n      const u = "[x](y.md)";\n')).toEqual([]);
    expect(linkTargets("- A bullet.\n\n    ```\n    [x](y.md)\n    ```\n")).toEqual([]);
    expect(linkTargets('Para.\n\n    const u = "[x](y.md)";\n')).toEqual([]);
    expect(linkTargets("- A bullet.\n\nBack at the margin.\n\n    [x](y.md)\n")).toEqual([]);
    // `* * *` is a thematic break, never the list item it resembles — reading it
    // as one would raise the code threshold and refuse a link inside real code.
    expect(linkTargets('* * *\n\n    const u = "[x](y.md)";\n')).toEqual([]);
  });

  /**
   * Finding 10. The fence state survived to end of input, so one stray ``` in
   * prose made every link and footnote after it invisible to both checks —
   * half a document unjudged, with no signal. CommonMark runs an unclosed
   * fence to end of document too, so the site renders none of those links; the
   * MCP door serves the raw body regardless, and a rule that cannot see a link
   * cannot refuse it.
   */
  it("a fence that never closes hides itself only, not the rest of the document", () => {
    const body = "Ends with a stray fence:\n\n```\n\nSee [the plan](/secret/plan.md). [^k]\n";
    expect(linkTargets(body)).toEqual(["/secret/plan.md"]);
    expect(checkFootnotes("knowledge/a.md", body, []).map((r) => r.slug)).toEqual([
      "ksor-footnote-unkeyed",
    ]);
    // Both rules again, this time through the checker the surfaces run: the
    // stray fence silenced BOTH, and a body that only proved the parser was
    // what let the last finding of this class hide.
    expect(refusals(body)).toEqual([
      "ksor-footnote-unkeyed knowledge/a.md",
      "ksor-link-widens knowledge/a.md",
    ]);
    // Inside a list item too, and with the stray line DROPPED rather than kept:
    // keeping it would leave its backticks to pair with the next run in the
    // code-span pass and swallow the link a second way.
    expect(linkTargets("- A bullet.\n\n    ```\n    [x](y.md)\n")).toEqual(["y.md"]);
    expect(linkTargets("```\n[x](y.md) and `code`\n")).toEqual(["y.md"]);
  });

  it("a fence that does close still hides everything between its ends", () => {
    const body = "```\n[x](/secret/plan.md)\n```\n\nAnd [y](/secret/plan.md).\n";
    expect(linkTargets(body)).toEqual(["/secret/plan.md"]);
    expect(refusals(body)).toEqual(["ksor-link-widens knowledge/a.md"]);
    // A fence opened inside an item closes at the left margin as readily as at
    // the item's own indent, and what follows the close is prose again.
    expect(linkTargets("- A.\n\n    ```\n    [x](y.md)\n```\n\nAnd [z](z.md).\n")).toEqual([
      "z.md",
    ]);
  });
});
