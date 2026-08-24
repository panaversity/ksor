import { describe, expect, it } from "vitest";

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
