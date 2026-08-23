import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_CASES,
  ATTACHMENT_SUFFIXES,
  attachmentKindOf,
  isAttachment,
  nearMissOf,
  parentDocumentOf,
} from "./attachment-rule.js";

describe("the attachment rule agrees with its own table", () => {
  for (const row of ATTACHMENT_CASES) {
    it(`${row.name} → ${row.kind ?? "document"}`, () => {
      expect(attachmentKindOf(row.name), `kind of ${row.name}`).toBe(row.kind);
      expect(parentDocumentOf(row.name), `parent of ${row.name}`).toBe(row.parent);
      expect(isAttachment(row.name)).toBe(row.kind !== null);
    });
  }
});

describe("a parent is derived by removing the suffix, never by truncating at a dot", () => {
  it("keeps every dot in a dotted stem", () => {
    expect(parentDocumentOf("v1.2.policy.summary.md")).toBe("v1.2.policy.md");
  });

  it("gives a .md parent even for an .mdx attachment — the record is CommonMark", () => {
    expect(parentDocumentOf("returns.summary.mdx")).toBe("returns.md");
  });
});

describe("near misses are named, not left to fail in the bundler", () => {
  it(".yml is refused pointing at .yaml", () => {
    expect(nearMissOf("returns.flashcards.yml")).toEqual({
      is: ".flashcards.yml",
      want: ".flashcards.yaml",
    });
  });

  it("a real attachment is not a near miss", () => {
    expect(nearMissOf("returns.flashcards.yaml")).toBeNull();
  });

  it("an ordinary document is not a near miss", () => {
    expect(nearMissOf("returns.md")).toBeNull();
  });
});

describe("the table itself is honest", () => {
  it("covers EVERY declared kind, and the negative case", () => {
    const kinds = new Set(ATTACHMENT_CASES.map((c) => c.kind));
    expect(kinds, "a table that never says null proves nothing about documents").toContain(null);
    // Derived from the suffix list rather than named here, so a kind added to
    // the rule with no row in the table fails on the kind it forgot — the
    // previous form hardcoded summary + deck and would have passed the quiz in
    // silently.
    for (const kind of new Set(ATTACHMENT_SUFFIXES.map((entry) => entry.kind))) {
      expect(kinds, `no ATTACHMENT_CASES row exercises kind "${kind}"`).toContain(kind);
    }
  });

  it("every positive row names a parent, and every negative row names none", () => {
    for (const row of ATTACHMENT_CASES) {
      expect(row.parent === null, `${row.name}`).toBe(row.kind === null);
    }
  });
});

describe("a quiz is an attachment of its document, on the same rule as the deck", () => {
  it("recognises .quiz.yaml", () => {
    expect(attachmentKindOf("returns.quiz.yaml")).toBe("quiz");
    expect(isAttachment("returns.quiz.yaml")).toBe(true);
    expect(parentDocumentOf("returns.quiz.yaml")).toBe("returns.md");
  });

  it("a dotfile with no stem attaches to nothing", () => {
    expect(attachmentKindOf(".quiz.yaml")).toBeNull();
  });

  it("a document merely named quiz.yaml is not one", () => {
    expect(attachmentKindOf("quiz.yaml")).toBeNull();
  });

  it(".quiz.yml is a NAMED near miss, not a silent bundler failure", () => {
    expect(nearMissOf("returns.quiz.yml")).toEqual({
      is: ".quiz.yml",
      want: ".quiz.yaml",
    });
  });
});

describe("a teaching guide is an attachment, on the same rule as the rest", () => {
  it("recognises .teaching.yaml", () => {
    expect(attachmentKindOf("returns.teaching.yaml")).toBe("teaching");
    expect(isAttachment("returns.teaching.yaml")).toBe(true);
    expect(parentDocumentOf("returns.teaching.yaml")).toBe("returns.md");
  });

  it("a dotfile with no stem attaches to nothing", () => {
    expect(attachmentKindOf(".teaching.yaml")).toBeNull();
  });

  it("a document merely named teaching.yaml is not one", () => {
    expect(attachmentKindOf("teaching.yaml")).toBeNull();
  });

  it(".teaching.yml is a NAMED near miss", () => {
    expect(nearMissOf("returns.teaching.yml")).toEqual({
      is: ".teaching.yml",
      want: ".teaching.yaml",
    });
  });
});
