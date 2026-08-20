import { describe, expect, it } from "vitest";

import { frontmatterMeta } from "./adapters/plain-tree.js";
import {
  governanceFingerprint,
  governanceFromFrontmatter,
  frontmatterListValues,
  NO_GOVERNANCE,
} from "./governance.js";

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

  it("treats blank and whitespace-only values as absent, never as empty strings", () => {
    expect(read(doc("title: T\nowner:   \nvisibility:")).owner).toBeNull();
    expect(read(doc("title: T\nvisibility:")).visibility).toBeNull();
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

describe("governanceFingerprint", () => {
  it("changes when any governance field changes — the whole point of the change key", () => {
    const base = read(doc("title: T\nstatus: draft"));
    const promoted = read(doc("title: T\nstatus: approved"));
    expect(governanceFingerprint(base)).not.toBe(governanceFingerprint(promoted));
  });

  it("is stable for the same governance written the same way", () => {
    const a = read(doc("title: T\nstatus: approved\nowner: ops"));
    const b = read(doc("title: T\nstatus: approved\nowner: ops"));
    expect(governanceFingerprint(a)).toBe(governanceFingerprint(b));
  });

  it("distinguishes a visibility change, which is a security control", () => {
    const pub = read(doc("title: T\nvisibility: public"));
    const int = read(doc("title: T\nvisibility: internal"));
    expect(governanceFingerprint(pub)).not.toBe(governanceFingerprint(int));
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
