/**
 * The report says where its out-of-corpus probes came from, and it is right.
 *
 * `BUILT_IN_OOC_CAVEAT` is the only thing standing between an operator and a
 * floor blessed entirely by far-domain probes — questions about astronomy score
 * low against any corpus, so a margin measured against them is an over-estimate
 * and the floor it recommends may still answer the near-misses just outside a
 * record's scope. `renderReport` gates that line on `ooc_source === "built-in"`.
 *
 * It never printed on the CLI. `ksor calibrate` with no `--ooc-file` passes
 * `null`, the classification tested `=== undefined`, and the probes themselves
 * fell back through `?? BUILT_IN_OOC` — so the run scored against the built-in
 * set and reported `provided`. Two expressions deciding one thing, disagreeing
 * about `null`. `resolveOoc` is now the one expression, and this holds the two
 * halves together: what it LABELS and what it RETURNS, and the caveat that
 * rides on the label.
 */
import { describe, expect, it } from "vitest";

import { fixture } from "./fixtures/math.js";
import { BUILT_IN_OOC, BUILT_IN_OOC_CAVEAT, buildReport, renderReport } from "./math.js";
import { resolveOoc } from "./run.js";

const CLOCK = new Date("2026-09-02T00:00:00Z");
const CASE = fixture.report_cases[0];

function rendered(oocSource: "built-in" | "provided"): string {
  if (CASE === undefined) throw new Error("the oracle fixture has no report case");
  return renderReport(
    buildReport(CASE.detail, { ...CASE.meta, oocSource }, CASE.target_precision, CLOCK),
    null,
  );
}

describe("resolveOoc decides the label and the probes together", () => {
  // `undefined` is the SDK caller that omitted the option; `null` is the CLI
  // with no `--ooc-file` (`commands.ts`). Both mean the same thing and must be
  // classified the same way — that they were not is the whole defect.
  it.each([
    ["undefined — the option omitted", undefined],
    ["null — `ksor calibrate` with no --ooc-file", null],
  ] as const)("%s is built-in, and IS the built-in set", (_name, probes) => {
    const r = resolveOoc(probes);
    expect(r.source).toBe("built-in");
    expect([...r.probes]).toEqual([...BUILT_IN_OOC]);
  });

  it("a supplied list is `provided`, and is passed through unchanged", () => {
    const probes = ["How many weeks of parental leave do employees get?"];
    const r = resolveOoc(probes);
    expect(r.source).toBe("provided");
    expect([...r.probes]).toEqual(probes);
  });

  it("an EMPTY supplied list is still `provided` — the caller chose it", () => {
    // `?? BUILT_IN_OOC` would keep an empty array, so the label must too: a
    // truthiness test here would have silently re-labelled it built-in.
    expect(resolveOoc([]).source).toBe("provided");
    expect(resolveOoc([]).probes).toEqual([]);
  });

  it("the label it returns is exactly what the caveat is gated on", () => {
    expect(rendered(resolveOoc(null).source)).toContain(BUILT_IN_OOC_CAVEAT);
    expect(rendered(resolveOoc(undefined).source)).toContain(BUILT_IN_OOC_CAVEAT);
    expect(rendered(resolveOoc(["a probe"]).source)).not.toContain(BUILT_IN_OOC_CAVEAT);
  });
});
