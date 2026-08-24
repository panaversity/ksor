import { describe, expect, it } from "vitest";

import { AUDIENCE_CASES, WIDENING_CASES } from "./audience-conformance.js";
import { mayReach, overlaps } from "./audience-rule.js";

describe("overlaps — record spec §2.4, one row of AUDIENCE_CASES at a time", () => {
  // Section rows are excluded HERE and nowhere else: a section declares no
  // list, so `overlaps` is not the function that decides one — the recursive
  // walk in `lib/admit.ts` is, and `audience-conformance.db.test.ts` runs those
  // rows against it. Skipping them silently would be the drift this table
  // exists to stop, so the split is stated and the count is asserted.
  const concepts = AUDIENCE_CASES.filter((c) => c.section === undefined);

  it("the table has section rows, and they are decided elsewhere", () => {
    expect(concepts.length).toBeLessThan(AUDIENCE_CASES.length);
  });

  for (const c of concepts) {
    it(c.name, () => {
      expect(overlaps(c.viewer, c.audience ?? [])).toBe(c.visible);
    });
  }
});

describe("mayReach — the widening rule, one row of WIDENING_CASES at a time", () => {
  for (const c of WIDENING_CASES) {
    it(c.name, () => {
      expect(mayReach(c.source, c.target)).toBe(c.reaches);
    });
  }
});
