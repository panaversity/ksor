/**
 * The SITE's half of the shared audience decision table (decision 18).
 *
 * `AUDIENCE_CASES` is the rule. The SQL half runs it through real Postgres
 * (`audience-conformance.db.test.ts`); the kernel's TypeScript half runs it
 * through `packages/content/src/lib/audience-rule.ts`
 * (`audience-overlap.test.ts`); and this file runs it through the copy of that
 * file the SITE actually ships and stages with —
 * `templates/scaffold/system/site/lib/audience-rule.ts`, imported here the way
 * every other site-lib suite in this directory imports its subject.
 *
 * Importing the SITE's file rather than the kernel's re-export is the whole
 * point. `audience-rule-drift.integration.test.ts` proves the two are
 * byte-identical, so this could have read either — but the one an adopter runs
 * is the site's, and a suite that names the site while testing the kernel is
 * one indirection away from asserting nothing about the site at all.
 *
 * That is what it had become. This file used to run `decideVisible` against
 * `RANKED_AUDIENCE_CASES`, the tier-ranked rule the overlap rule REPLACED and
 * which no surface has read since: `stage-knowledge.ts` admits a concept with
 * `overlaps(viewer(), concept.audience)` and nothing else. Proved before this
 * was rewritten — `overlaps` in the site's copy was mutated to publish an empty
 * audience list to every viewer, which is the exact "omission is never
 * defaulted" guarantee of record spec §2.4, and the suite titled "the SITE's
 * half" passed all sixteen of its cases. It fails on the row now.
 *
 * The visibility leak was closed and re-entered through four successive doors,
 * every time with both sides' own tests green, because each side was
 * internally consistent with itself. A dead rule asserted against a retired
 * table is that failure mode with the lights left on.
 */

import { describe, expect, it } from "vitest";

import { AUDIENCE_CASES } from "@panaversity/ksor-content";
import { overlaps } from "../templates/scaffold/system/site/lib/audience-rule.js";

/**
 * Section rows are excluded HERE and nowhere else, and the count is asserted
 * both ways so the exclusion can never quietly empty the suite. A section
 * declares no list of its own; the kernel admits one through a recursive
 * `parent_id` walk (`lib/admit.ts`, run over these rows in
 * `audience-conformance.db.test.ts`), and the site has no section rule to run
 * at all — it regenerates each directory's index from the concepts this rule
 * already admitted, so a directory with nothing left in it produces no index.
 */
const concepts = AUDIENCE_CASES.filter((c) => c.section === undefined);

describe("the audience decision table, in the rule the site stages with", () => {
  it("has concept rows to judge, and section rows judged elsewhere", () => {
    expect(
      concepts.length,
      "AUDIENCE_CASES holds no concept row — this suite asserts nothing",
    ).toBeGreaterThan(0);
    expect(concepts.length).toBeLessThan(AUDIENCE_CASES.length);
  });

  it.each(concepts)("$name", (testCase) => {
    expect(
      overlaps(testCase.viewer, testCase.audience ?? []),
      `viewer=[${testCase.viewer.join(", ")}] concept=${
        testCase.audience === null ? "(no list at all)" : `[${testCase.audience.join(", ")}]`
      }`,
    ).toBe(testCase.visible);
  });

  /**
   * A row carrying `refusal` is a state the record checker makes unauthorable.
   * It is still asserted through the rule, because "the checker refuses it" and
   * "the surface would serve it" are different claims — the second is what a
   * carried pre-profile generation or a hand-written row would meet.
   */
  it("the refused states are in the table, and every one of them is served to nobody", () => {
    const refused = concepts.filter((c) => c.refusal !== undefined);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.filter((c) => c.visible)).toEqual([]);
  });
});
