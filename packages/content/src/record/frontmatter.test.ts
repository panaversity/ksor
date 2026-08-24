import { describe, expect, it } from "vitest";

import { splitFrontmatter } from "./frontmatter.js";

describe("splitFrontmatter", () => {
  it("returns null frontmatter and the whole text when there is no fence", () => {
    const r = splitFrontmatter("# Hello\n\nbody\n", "knowledge/x.md");
    expect(r).toEqual({ ok: true, frontmatter: null, body: "# Hello\n\nbody\n" });
  });

  it("parses a mapping and hands back the body byte-exact after the closing fence", () => {
    const r = splitFrontmatter(
      "---\ntitle: Hi\nksor:\n  audience: [public]\n---\n\nBody **here**\n",
      "knowledge/x.md",
    );
    expect(r).toEqual({
      ok: true,
      frontmatter: { title: "Hi", ksor: { audience: ["public"] } },
      body: "\nBody **here**\n",
    });
  });

  it("preserves unknown keys and nested mappings (OKF §11)", () => {
    const r = splitFrontmatter("---\nx-custom:\n  deep: [1, 2]\n---\n", "k");
    expect(r).toEqual({ ok: true, frontmatter: { "x-custom": { deep: [1, 2] } }, body: "" });
  });

  it("keeps timestamps as strings — the profile parses instants itself", () => {
    const r = splitFrontmatter("---\nat: 2026-08-20T09:00:00Z\nd: 2026-08-20\n---\n", "k");
    expect(r).toEqual({
      ok: true,
      frontmatter: { at: "2026-08-20T09:00:00Z", d: "2026-08-20" },
      body: "",
    });
  });

  it("strips a BOM and normalises CRLF before looking for the fence", () => {
    const r = splitFrontmatter("﻿---\r\ntitle: A\r\n---\r\nbody\r\n", "k");
    expect(r).toEqual({ ok: true, frontmatter: { title: "A" }, body: "body\n" });
  });

  it("an empty block is an empty mapping, not a refusal", () => {
    expect(splitFrontmatter("---\n---\nb", "k")).toEqual({
      ok: true,
      frontmatter: {},
      body: "b",
    });
  });

  it("refuses a missing closing fence with ksor-frontmatter-invalid", () => {
    const r = splitFrontmatter("---\ntitle: A\n\nbody\n", "knowledge/x.md");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-frontmatter-invalid");
    expect(r.refusal.path).toBe("knowledge/x.md");
    expect(r.refusal.why).toMatch(/closing/);
  });

  it("refuses unparsable YAML, naming the parser's reason", () => {
    const r = splitFrontmatter("---\ntitle: [unclosed\n---\n", "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-frontmatter-invalid");
    expect(r.refusal.why.length).toBeGreaterThan(10);
  });

  it("refuses a duplicate key — a Map keeps the last write, YAML refuses the document", () => {
    const r = splitFrontmatter("---\ntitle: A\ntitle: B\n---\n", "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-frontmatter-invalid");
  });

  it("refuses a non-mapping frontmatter (a list, a scalar)", () => {
    for (const text of ["---\n- a\n- b\n---\n", "---\njust words\n---\n"]) {
      const r = splitFrontmatter(text, "k");
      expect(r.ok, text).toBe(false);
      if (r.ok) return;
      expect(r.refusal.slug).toBe("ksor-frontmatter-invalid");
      expect(r.refusal.why).toMatch(/mapping/);
    }
  });

  it("a fence must open on the very first line", () => {
    const r = splitFrontmatter("\n---\ntitle: A\n---\n", "k");
    expect(r).toEqual({ ok: true, frontmatter: null, body: "\n---\ntitle: A\n---\n" });
  });
});
