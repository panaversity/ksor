import { describe, expect, it } from "vitest";

import { frontmatterMeta } from "./adapters/plain-tree.js";
import { governanceFromFrontmatter, frontmatterListValues, NO_GOVERNANCE } from "./governance.js";

const doc = (frontmatter: string): string => `---\n${frontmatter}\n---\n\nBody text.\n`;

const read = (text: string) => governanceFromFrontmatter(frontmatterMeta(text), text);

describe("governanceFromFrontmatter", () => {
  it("reads every authored governance key", () => {
    const text = doc(
      [
        "title: Machine rules",
        "status: approved",
        "visibility: internal",
        "owner: safety-team",
        "superseded_by: knowledge/machine-rules-v2",
      ].join("\n"),
    );
    expect(read(text)).toEqual({
      visibility: "internal",
      docStatus: "approved",
      owner: "safety-team",
      provenance: null,
      supersededBy: "knowledge/machine-rules-v2",
    });
  });

  it("is all-null for a document that declares none of them", () => {
    expect(read(doc("title: Plain\nstatus: draft".replace("\nstatus: draft", "")))).toEqual(
      NO_GOVERNANCE,
    );
  });

  it("carries a scalar provenance as a one-element list", () => {
    expect(read(doc("title: T\nprovenance: ISO 45001 §7.2")).provenance).toEqual([
      "ISO 45001 §7.2",
    ]);
  });

  it("carries a provenance BLOCK LIST, which the scalar reader alone would drop", () => {
    const text = doc(
      [
        "title: T",
        "provenance:",
        "  - ISO 45001 §7.2",
        "  - Internal memo 2026-03",
        "owner: ops",
      ].join("\n"),
    );
    const g = read(text);
    expect(g.provenance).toEqual(["ISO 45001 §7.2", "Internal memo 2026-03"]);
    // the scalar keys around the list still read correctly
    expect(g.owner).toBe("ops");
  });

  it("strips quotes from list items", () => {
    const text = doc(["title: T", "provenance:", '  - "quoted source"', "  - 'single'"].join("\n"));
    expect(read(text).provenance).toEqual(["quoted source", "single"]);
  });

  it("treats a blank non-security value as absent, never as an empty string", () => {
    expect(read(doc("title: T\nowner:   ")).owner).toBeNull();
  });

  it("REFUSES a declared-but-unreadable visibility — it is a security control", () => {
    // Reading it as absent gives the document the DEFAULT tier and serves it,
    // while the site excludes it entirely. Fail closed instead.
    expect(() => read(doc("title: T\nvisibility:"))).toThrow(/unreadable tier/i);
    expect(() => read(doc("title: T\nvisibility:\n  - public"))).toThrow(/exactly one tier/i);
  });

  it("does NOT close the vocabulary — an unknown audience is carried, not refused", () => {
    // The instance owns the audience model; refusing here would put it in two places.
    expect(read(doc("title: T\nvisibility: board-only")).visibility).toBe("board-only");
  });
});

describe("frontmatterListValues", () => {
  it("returns null when the key is absent or is a scalar", () => {
    expect(frontmatterListValues(doc("title: T"), "provenance")).toBeNull();
    expect(frontmatterListValues(doc("title: T\nprovenance: one"), "provenance")).toBeNull();
  });

  it("returns null for a document with no frontmatter at all", () => {
    expect(frontmatterListValues("# Just a heading\n", "provenance")).toBeNull();
  });
});

describe("list shapes the site accepts", () => {
  it("reads an UNINDENTED block sequence — valid YAML, and the site reads it", () => {
    const text = doc(["title: T", "provenance:", "- ISO 45001", "- Memo 2026-03"].join("\n"));
    expect(read(text).provenance).toEqual(["ISO 45001", "Memo 2026-03"]);
  });

  it("still reads an indented one", () => {
    const text = doc(["title: T", "provenance:", "  - ISO 45001"].join("\n"));
    expect(read(text).provenance).toEqual(["ISO 45001"]);
  });
});

describe("visibility is read from the TEXT, never from a map a sibling can empty", () => {
  it("REFUSES when an unrelated key makes the parser drop the whole map", () => {
    // `frontmatterMeta` empties the WHOLE map on any parse failure, so one
    // sibling key this narrow parser cannot read silently dropped
    // `visibility:` — the document took the default tier and was served while
    // the site still hid it. The leak, entering through a third door.
    const text = doc(["title: T", "tags: [hr, payroll]", "visibility: internal"].join("\n"));
    expect(() => read(text)).toThrow(/could not resolve it/i);
    // and it names the actual cause, not just the symptom
    expect(() => read(text)).toThrow(/flow list/i);
  });

  it("REFUSES for an unquoted value containing a colon-space, the other poison shape", () => {
    const text = doc(["title: Report: Q3", "visibility: internal"].join("\n"));
    expect(() => read(text)).toThrow(/could not resolve it/i);
  });

  it("still reads visibility when the siblings are shapes it CAN read", () => {
    const text = doc(["title: T", "owner: ops", "visibility: internal"].join("\n"));
    expect(read(text).visibility).toBe("internal");
  });

  it("says nothing about a document that declares no visibility at all", () => {
    expect(read(doc(["title: T", "tags: [hr]"].join("\n"))).visibility).toBeNull();
  });
});

describe("one frontmatter grammar, not two", () => {
  // Two regexes disagreeing about where a block ENDS is how the leak found a
  // fourth door: a `----` or `--- ` close satisfied the adapter (poisoning its
  // map) and not this reader (so both guards went silent).
  const poisoned = (close: string): string =>
    `---\ntitle: T\ntags: [hr, payroll]\nvisibility: internal\n${close}\n\nBody.\n`;

  for (const close of ["---", "----", "--- "]) {
    it(`REFUSES a poisoned map whatever closes the block: ${JSON.stringify(close)}`, () => {
      expect(() => read(poisoned(close))).toThrow(/could not resolve it/i);
    });
  }
});
