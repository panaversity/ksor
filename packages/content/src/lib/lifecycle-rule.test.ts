import { describe, expect, it } from "vitest";

import { LIFECYCLE_CASES } from "./lifecycle-conformance.js";
import { admitsLifecycle } from "./lifecycle-rule.js";

describe("admitsLifecycle — record spec §2.5, one row of LIFECYCLE_CASES at a time", () => {
  for (const c of LIFECYCLE_CASES) {
    it(c.name, () => {
      expect(admitsLifecycle(c.doc, "human", c.at, c.drafts)).toBe(c.human);
      expect(admitsLifecycle(c.doc, "machine", c.at, c.drafts)).toBe(c.machine);
    });
  }

  it("the table covers every line of the §2.5 table plus the build-vs-request boundary", () => {
    const names = LIFECYCLE_CASES.map((c) => c.name).join("\n");
    for (const needle of ["draft", "effective", "stale", "deprecated", "boundary"]) {
      expect(names).toMatch(new RegExp(needle));
    }
  });
});
