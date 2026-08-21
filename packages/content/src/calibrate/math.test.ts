// Fixture-driven: every expectation below was computed by the Python truth
// (sor_content.calibrate @ b554f91) and recorded in fixtures/math.json — the
// TS port must reproduce the oracle bit- and byte-exact. Pure: the fixture is
// an inlined module, no fs at runtime.
import { describe, expect, it } from "vitest";

import { fixture } from "./fixtures/math.js";
import {
  BUILT_IN_OOC,
  QUERIES_FILE_CAVEAT,
  aurc,
  buildReport,
  pasteValue,
  pythonFloatRepr,
  pythonFormatFixed,
  pythonRound,
  recommendFloor,
  renderReport,
  requireScore,
  riskCoverageCurve,
  statsAtFloor,
} from "./math.js";

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return "(did not throw)";
}

describe("oracle constants", () => {
  it("BUILT_IN_OOC is the oracle's 20 far-domain probes, verbatim", () => {
    expect([...BUILT_IN_OOC]).toEqual(fixture.built_in_ooc);
  });

  it("QUERIES_FILE_CAVEAT matches the oracle verbatim", () => {
    expect(QUERIES_FILE_CAVEAT).toBe(fixture.queries_file_caveat);
  });
});

describe("risk–coverage maths against the oracle", () => {
  for (const c of fixture.math_cases) {
    describe(c.name, () => {
      it("stats_at_floor", () => {
        for (const s of c.stats) {
          expect(statsAtFloor(c.points, s.floor), `floor ${s.floor}`).toEqual(s.expected);
        }
      });

      it("risk_coverage_curve", () => {
        expect(riskCoverageCurve(c.points)).toEqual(c.curve);
      });

      it("aurc is bit-exact, and rounds to 4 decimals like Python", () => {
        const got = aurc(c.points);
        expect(got, `aurc saw ${got}`).toBe(c.aurc);
        expect(pythonRound(got, 4), `round4 of ${got}`).toBe(c.aurc_round4);
      });

      it("recommend_floor", () => {
        for (const r of c.recommend) {
          expect(
            recommendFloor(c.points, r.requested_target),
            `target ${r.requested_target}`,
          ).toEqual(r.expected);
        }
      });

      const paste = c.paste;
      if (paste) {
        it("paste_value", () => {
          const [value, why] = pasteValue(c.points);
          expect(value, `paste saw ${value}`).toBe(paste.value);
          expect(why).toBe(paste.why);
        });
      }
    });
  }
});

describe("paste_value refuses a one-sided distribution", () => {
  for (const c of fixture.paste_errors) {
    it(c.name, () => {
      expect(thrownMessage(() => pasteValue(c.points))).toBe(c.error);
    });
  }
});

describe("report assembly and the printed recommendation block", () => {
  for (const c of fixture.report_cases) {
    it(c.name, () => {
      // Fixed clock: the report records the DATE beside the number, and a
      // measurement date that moves would make the fixture untestable.
      const report = buildReport(
        c.detail,
        c.meta,
        c.target_precision,
        new Date("2026-08-21T00:00:00Z"),
      );
      expect(report).toEqual(c.expected);
      expect(renderReport(report)).toBe(c.rendered);
    });
  }

  it("a SEPARABLE measurement ends in the machine-checked paste line, with its date", () => {
    for (const c of fixture.report_cases.filter((x) => x.expected.separable)) {
      const lastLine = c.rendered.trimEnd().split("\n").at(-1) ?? "";
      expect(lastLine, `case ${c.name}: ${lastLine}`).toMatch(
        /^ {2}vector_floor: -?\d+\.\d{3} {3}# calibrated \d{4}-\d{2}-\d{2} on generation (\d+|unknown \(no generation pinned\)), model .+\/d\d+, door: (synthesized|queries-file)$/,
      );
    }
  });

  it("a NON-separable measurement hands out NO floor at all", () => {
    // The intended operator is a coding agent; a paste-ready number under a
    // "NOT separable" verdict is a floor known to leak, pasted.
    const cases = fixture.report_cases.filter((x) => !x.expected.separable);
    expect(cases.length, "the fixture covers the non-separable case").toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.rendered, c.name).not.toMatch(/^ {2}vector_floor: -?\d/m);
      expect(c.rendered, c.name).toContain("vector_floor: uncalibrated");
      expect(c.rendered, c.name).toMatch(/NOT pasting a floor/);
    }
  });

  it("the SYNTHESIZED door carries its caveat — it is the DEFAULT and the biased one", () => {
    // Found live 2026-08-21: an agent calibrated a real record through the
    // synthesized door, was told "separable" with a floor of 0.631, and then
    // measured real questions the corpus answers scoring 0.530-0.606. Pasting
    // that floor would have made the record refuse questions whose answers it
    // had just returned. A synthesized query is written FROM the passage it is
    // scored against, so in-corpus scores are systematically higher than a
    // human's phrasing of the same question — and the door with the bias was
    // the only one with no caveat printed.
    const cases = fixture.report_cases.filter((x) => x.meta.door === "synthesized");
    expect(cases.length, "the fixture covers the synthesized door").toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.rendered, c.name).toContain("CAVEAT");
      expect(c.rendered, c.name).toMatch(/written FROM the passages/);
    }
  });

  it("every report states the margin and the number of probes behind it", () => {
    // paste_why names max-OOC and min-in-corpus; the SUBTRACTION is the number
    // that decides, and a margin measured over six probes is not the same claim
    // as the same margin over sixty. Both were on the report and neither was
    // printed.
    for (const c of fixture.report_cases) {
      const line = c.rendered.split("\n").find((l) => l.startsWith("separation margin:"));
      expect(line, `case ${c.name}`).toBeDefined();
      expect(line, `case ${c.name}`).toContain(`${c.expected.in_corpus_queries} in-corpus`);
      expect(line, `case ${c.name}`).toContain(`${c.expected.ooc_probes} out-of-corpus`);
    }
  });

  it("the ALT line reports the precision it was MEASURED at, never a constant", () => {
    // The oracle read a key its report never carried, so this line always said
    // 0.95 whatever was measured — a report describing a different measurement
    // than the one it performed.
    for (const c of fixture.report_cases) {
      if (c.expected.target_precision === null) continue;
      const alt = c.rendered.split("\n").find((l) => l.startsWith("ALT ("));
      expect(alt, `case ${c.name}`).toContain(`(${String(c.expected.target)}`);
    }
  });
});

describe("requireScore — a null score is fatal, never a data point", () => {
  it("passes a real score through", () => {
    expect(requireScore("q", 0.5)).toBe(0.5);
    expect(requireScore("q", 0)).toBe(0);
  });

  for (const c of fixture.require_score_cases) {
    it(`null score for ${JSON.stringify(c.query)}`, () => {
      expect(thrownMessage(() => requireScore(c.query, null))).toBe(c.error);
    });
  }
});

describe("Python rounding and formatting fidelity (bit-exact)", () => {
  for (const c of fixture.format_cases) {
    it(`x = ${c.repr}`, () => {
      expect(pythonRound(c.value, 3), `round(${c.repr}, 3)`).toBe(c.round3);
      expect(pythonRound(c.value, 4), `round(${c.repr}, 4)`).toBe(c.round4);
      expect(pythonFormatFixed(c.value, 3), `.3f of ${c.repr}`).toBe(c.fixed3);
      expect(pythonFloatRepr(c.value), `repr of ${c.repr}`).toBe(c.repr);
    });
  }

  it("negative values keep Python's sign behavior", () => {
    // Not oracle-recorded (scores are similarities, ≥ 0 in practice) but the
    // helpers must not silently mishandle a negative cosine.
    expect(pythonRound(-0.0625, 3)).toBe(-0.062);
    expect(pythonFormatFixed(-0.0625, 3)).toBe("-0.062");
    expect(pythonFloatRepr(-1)).toBe("-1.0");
  });
});
