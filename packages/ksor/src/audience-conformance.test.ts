/**
 * The SITE's half of the shared audience decision table.
 *
 * `AUDIENCE_CASES` lives in the kernel and is asserted against the real SQL in
 * `audience-conformance.db.test.ts`. This file asserts the SITE's rule against
 * the SAME rows, so the two surfaces cannot drift without one of them failing
 * on the exact case it broke.
 *
 * That mattered enough to build: the visibility leak was closed and re-entered
 * through four successive doors, and every time both sides' own tests stayed
 * green, because each side was internally consistent with itself.
 *
 * `decideVisible` is the CANONICAL copy, in the kernel. The scaffold's site
 * carries a byte-identical copy of the same file (it cannot import the kernel:
 * its lib is dependency-light and runs inside Next's build), and
 * `audience-rule-drift.test.ts` fails if the two ever differ — so asserting the
 * kernel's copy here asserts the site's.
 */

import { describe, expect, it } from "vitest";

import { AUDIENCE_CASES, decideVisible } from "@panaversity/ksor-content";

describe("the audience decision table, in the site's rule", () => {
  it.each(AUDIENCE_CASES)("$name", (testCase) => {
    // The site has no concept of "an unidentified viewer": a build is always
    // FOR an audience, and with no model it builds everything. Both are the
    // first tier, which is what the kernel resolves a null viewer to.
    const model =
      testCase.audiences.length === 0
        ? null
        : {
            audiences: testCase.audiences,
            defaultVisibility: testCase.defaultVisibility ?? "",
          };
    const audience = testCase.viewer ?? testCase.audiences[0] ?? "";
    expect(
      decideVisible(model, audience, testCase.visibility),
      `build=${JSON.stringify(audience)} document=${JSON.stringify(testCase.visibility)} ` +
        `model=[${testCase.audiences.join(", ")}] default=${JSON.stringify(testCase.defaultVisibility)}`,
    ).toBe(testCase.visible);
  });
});
