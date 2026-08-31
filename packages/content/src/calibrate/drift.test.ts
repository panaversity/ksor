/**
 * What the drift monitor may and may not say.
 *
 * The hard part is not the arithmetic, it is the REFUSALS: this reads traffic,
 * so it must never characterise a distribution it does not have, and it must
 * never let a verdict read as a calibration. Those are the assertions worth
 * mutating.
 */

import { describe, expect, it } from "vitest";

import { driftReport, renderDrift, MARGIN_BAND, MIN_SAMPLES, type DriftSample } from "./drift.js";

/** `n` answered searches at `score`. */
const answered = (n: number, score: number): DriftSample[] =>
  Array.from({ length: n }, () => ({ topCosine: score, abstained: false }));

/** `n` refused searches, necessarily below the floor. */
const abstained = (n: number, score: number): DriftSample[] =>
  Array.from({ length: n }, () => ({ topCosine: score, abstained: true }));

describe("it declines to characterise traffic it does not have", () => {
  it("says no-data for an empty log rather than reading as healthy", () => {
    const report = driftReport(0.55, []);
    expect(report.verdict).toBe("no-data");
    expect(report.samples).toBe(0);
  });

  it("says no-data one sample below the floor, and changes its mind one above", () => {
    const below = driftReport(0.55, answered(MIN_SAMPLES - 1, 0.9));
    expect(below.verdict, "below the sample floor").toBe("no-data");
    const at = driftReport(0.55, [...answered(MIN_SAMPLES - 1, 0.9), ...abstained(1, 0.2)]);
    expect(at.verdict, "at the sample floor it will characterise").not.toBe("no-data");
  });

  it("reports the counts even when it declines a verdict — the evidence is not withheld", () => {
    const report = driftReport(0.55, [...answered(3, 0.9), ...abstained(2, 0.1)]);
    expect(report.samples).toBe(5);
    expect(report.answered).toBe(3);
    expect(report.abstained).toBe(2);
  });
});

describe("marginal answers — the ones that would flip if the number moved", () => {
  it("counts an answer inside the band and not one outside it", () => {
    const floor = 0.55;
    const report = driftReport(floor, [
      ...answered(20, floor + MARGIN_BAND / 2), // inside
      ...answered(20, floor + MARGIN_BAND * 5), // outside
      ...abstained(10, 0.2),
    ]);
    expect(report.marginal).toBe(20);
    expect(report.marginalShare).toBeCloseTo(0.5, 5);
  });

  it("counts a score exactly on the band, which floats would otherwise exclude", () => {
    // 0.56 - 0.55 is 0.010000000000000009 in IEEE. "Within 0.01 of the floor"
    // has to mean what it says rather than what binary subtraction leaves.
    const report = driftReport(0.55, [...answered(40, 0.56), ...abstained(10, 0.2)]);
    expect(report.marginal).toBe(40);
  });

  it("watches when the answer set turns on the exact number", () => {
    const floor = 0.55;
    const report = driftReport(floor, [
      ...answered(30, floor + MARGIN_BAND / 2),
      ...answered(20, 0.9),
      ...abstained(10, 0.2),
    ]);
    expect(report.verdict).toBe("watch");
    expect(report.why).toContain("within");
  });

  it("is steady when answers sit clear of the floor and the gate still refuses", () => {
    const report = driftReport(0.55, [...answered(50, 0.9), ...abstained(10, 0.2)]);
    expect(report.verdict).toBe("steady");
  });
});

describe("a gate that has stopped refusing anything", () => {
  it("is watched, because the two causes are indistinguishable from here", () => {
    const report = driftReport(0.55, answered(60, 0.95));
    expect(report.verdict).toBe("watch");
    // The claim it makes must be the honest one: not "your floor is stale".
    expect(report.why).toContain("only a re-measurement tells them apart");
  });

  it("is not watched merely for a low abstain rate, which is an ordinary record", () => {
    const report = driftReport(0.55, [...answered(99, 0.95), ...abstained(1, 0.2)]);
    expect(report.verdict).toBe("steady");
  });
});

describe("the percentiles describe ANSWERS, not the whole log", () => {
  it("ignores refused searches, whose scores are below the floor by definition", () => {
    const report = driftReport(0.55, [...answered(50, 0.8), ...abstained(50, 0.1)]);
    expect(report.p05).toBeCloseTo(0.8, 5);
    expect(report.p50).toBeCloseTo(0.8, 5);
    expect(report.p95).toBeCloseTo(0.8, 5);
  });

  it("answers null rather than 0 when nothing was answered", () => {
    const report = driftReport(0.55, abstained(40, 0.1));
    expect(report.p50, "0 would read as a measured score").toBeNull();
  });
});

describe("what it prints", () => {
  it("leads with the numbers and names the remedy when it watches", () => {
    const text = renderDrift(driftReport(0.55, answered(60, 0.95)), "last 30 days");
    expect(text).toContain("declared vector_floor  0.550");
    expect(text).toContain("WATCH");
    expect(text).toContain("ksor calibrate");
    // It must not present itself as a calibration.
    expect(text).toContain("traffic, not a calibration");
  });

  it("prints no remedy when it is steady — advice nobody needs is noise", () => {
    const text = renderDrift(
      driftReport(0.55, [...answered(50, 0.9), ...abstained(10, 0.2)]),
      "last 30 days",
    );
    expect(text).not.toContain("ksor calibrate");
  });
});
