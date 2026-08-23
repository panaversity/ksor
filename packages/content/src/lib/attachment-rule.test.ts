import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_CASES,
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
  it("covers both kinds and the negative case", () => {
    const kinds = new Set(ATTACHMENT_CASES.map((c) => c.kind));
    expect(kinds, "a table that never says null proves nothing about documents").toContain(null);
    expect(kinds).toContain("summary");
    expect(kinds).toContain("deck");
  });

  it("every positive row names a parent, and every negative row names none", () => {
    for (const row of ATTACHMENT_CASES) {
      expect(row.parent === null, `${row.name}`).toBe(row.kind === null);
    }
  });
});
