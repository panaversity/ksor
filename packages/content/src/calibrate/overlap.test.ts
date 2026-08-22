/**
 * Naming the probes that held a calibration open.
 *
 * See overlap.ts for why this is not in `renderReport`: that function's output is
 * pinned byte-exact to the Python oracle's, and operator guidance should not
 * require regenerating a captured fixture to improve.
 */

import { describe, expect, it } from "vitest";

import { buildReport } from "./math.js";
import { overlapAdvice, overlappingProbes } from "./overlap.js";

const meta = {
  generation: 1,
  pinned: false,
  model: "gemini-embedding-001",
  dim: 1536,
  door: "queries-file" as const,
  oocSource: "provided" as const,
};

/** The real shape, from the book that produced this finding. */
const DETAIL = [
  { query: "what is the ecosystem concept", in_corpus: true, score: 0.68 },
  { query: "what is a digital FTE", in_corpus: true, score: 0.79 },
  { query: "what roles does this book train me for", in_corpus: true, score: 0.81 },
  { query: "which vector database should I choose", in_corpus: false, score: 0.721 },
  { query: "how do I set up CI in GitHub Actions", in_corpus: false, score: 0.676 },
  { query: "what is the parental leave policy", in_corpus: false, score: 0.552 },
];

const reportOf = (detail: typeof DETAIL) =>
  buildReport(detail, meta, 0.95, new Date("2026-08-22T00:00:00Z"));

describe("the probes that held a calibration open are named", () => {
  it("names the one that outscored the weakest in-corpus question", () => {
    const advice = overlapAdvice(reportOf(DETAIL));
    expect(advice, "a non-separable measurement must say WHICH probe").not.toBeNull();
    expect(advice).toMatch(/which vector database should I choose/);
    expect(advice, "with its score, so the margin is visible").toMatch(/0\.721/);
  });

  it("leaves out probes that scored below the weakest — they decided nothing", () => {
    const advice = overlapAdvice(reportOf(DETAIL)) ?? "";
    expect(advice).not.toMatch(/parental leave/);
    expect(advice).not.toMatch(/GitHub Actions/);
  });

  it("names BOTH readings, because either can be the right one", () => {
    // The probe is sometimes mislabelled and sometimes a genuine near-miss.
    // Asserting one alone sends half the readers the wrong way — the fixture's
    // own non-separable case is held open by "Best pizza place near me?", which
    // is not mislabelled at all.
    const advice = overlapAdvice(reportOf(DETAIL)) ?? "";
    expect(advice, "the mislabelled reading").toMatch(/COVERS|in-corpus side/);
    expect(advice, "and the genuine one").toMatch(/does not separate|uncalibrated/);
  });

  it("says nothing at all when the measurement separated", () => {
    const clean = DETAIL.map((d) =>
      d.query.startsWith("which vector") ? { ...d, score: 0.4 } : d,
    );
    const report = reportOf(clean);
    expect(report.separable, "the fixture must actually separate here").toBe(true);
    expect(overlappingProbes(report)).toEqual([]);
    expect(overlapAdvice(report)).toBeNull();
  });

  it("orders them worst first — the most likely culprit leads", () => {
    const two = [
      ...DETAIL,
      { query: "how do I deploy an agent to production", in_corpus: false, score: 0.7 },
    ];
    expect(overlappingProbes(reportOf(two)).map((d) => d.score)).toEqual([0.721, 0.7]);
  });
});
