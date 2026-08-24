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

describe("splitFrontmatter — hostile inputs (from review)", () => {
  it("a U+2028 inside a scalar is not a line break: the fence scanner must agree with YAML 1.2", () => {
    // JS `m`-flag `^`/`$` treat U+2028 as a line terminator; YAML 1.2 does not. A regex
    // scanner cut the frontmatter mid-line and published the real fence as body.
    const r = splitFrontmatter("---\ntitle: 'a ---  rest'\n---\nbody", "k");
    expect(r).toEqual({ ok: true, frontmatter: { title: "a ---  rest" }, body: "body" });
  });

  it("the opening fence tolerates trailing whitespace exactly as the closing one does", () => {
    const r = splitFrontmatter("---  \nksor:\n  audience: [internal]\n---\nbody", "k");
    expect(r.ok && r.frontmatter).toEqual({ ksor: { audience: ["internal"] } });
  });

  it("a lone CR is a checkout artefact too, normalised like CRLF", () => {
    const r = splitFrontmatter("---\r\ntitle: a\r---\rbody", "k");
    expect(r).toEqual({ ok: true, frontmatter: { title: "a" }, body: "body" });
  });

  it("a `---` line inside a block scalar closes the fence — the profile forbids one there (spec §2)", () => {
    // A line scan is the contract: the first fence line ends the block, whatever YAML thinks.
    const r = splitFrontmatter("---\ntitle: |\n  a\n---\n  b\n---\nbody", "k");
    expect(r).toEqual({ ok: true, frontmatter: { title: "a\n" }, body: "  b\n---\nbody" });
  });

  it("an alias bomb is refused without the parser's class name in the sentence", () => {
    const bomb = ["a: &a [x,x,x,x,x,x,x,x,x,x]"];
    for (let i = 1; i < 8; i++) {
      const prev = String.fromCharCode(96 + i);
      const next = String.fromCharCode(97 + i);
      bomb.push(`${next}: &${next} [${Array(10).fill(`*${prev}`).join(",")}]`);
    }
    const r = splitFrontmatter(`---\n${bomb.join("\n")}\n---\n`, "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.why).not.toMatch(/Error:/);
  });

  it("a second document marker is refused in the author's words, not the library's", () => {
    const r = splitFrontmatter("---\ntitle: a\n...\ntitle: b\n---\n", "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.why).not.toMatch(/parseAllDocuments/);
    expect(r.refusal.why).toMatch(/second document/);
  });

  it("a tagged value that is not plain data (`!!binary`) is refused, with no process warning", () => {
    const r = splitFrontmatter("---\ntitle: !!binary aGk=\n---\n", "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-frontmatter-invalid");
    expect(r.refusal.why).toMatch(/tag/);
  });

  it("an unknown tag is a refusal, not a warning on stderr", () => {
    const r = splitFrontmatter("---\ntitle: !!js/function 'x'\n---\n", "k");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.why).toMatch(/tag/);
  });
});
