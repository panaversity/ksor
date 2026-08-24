import { describe, expect, it } from "vitest";

import { OVERLAP_CASES, WIDENING_CASES } from "./audience-conformance.js";
import { mayReach, overlaps } from "./audience-rule.js";

describe("overlaps — record spec §2.4, one row of OVERLAP_CASES at a time", () => {
  for (const c of OVERLAP_CASES) {
    it(c.name, () => {
      expect(overlaps(c.viewer, c.audience)).toBe(c.visible);
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
