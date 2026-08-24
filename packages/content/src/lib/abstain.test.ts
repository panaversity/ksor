import { describe, expect, it } from "vitest";

import { keywordAbstains, vectorAbstains, type AbstainConfig } from "./abstain.js";
import { GATE_PREDICATE_DIGEST } from "./search.js";

const calibrated: AbstainConfig = {
  vectorFloor: 0.634,
  keywordFloor: null,
  floorDigest: GATE_PREDICATE_DIGEST,
};
const uncalibrated: AbstainConfig = { vectorFloor: null, keywordFloor: null, floorDigest: null };

describe("vectorAbstains", () => {
  it("gate OFF when uncalibrated — never abstains on score", () => {
    expect(vectorAbstains(0.01, uncalibrated)).toBe(false);
    expect(vectorAbstains(null, uncalibrated)).toBe(false);
  });

  it("strictly-less-than the floor abstains; at the floor serves", () => {
    expect(vectorAbstains(0.6339, calibrated)).toBe(true);
    expect(vectorAbstains(0.634, calibrated)).toBe(false);
    expect(vectorAbstains(0.9, calibrated)).toBe(false);
  });

  it("no vector candidate at all abstains when calibrated", () => {
    expect(vectorAbstains(null, calibrated)).toBe(true);
  });
});

describe("keywordAbstains", () => {
  it("null floor: abstains only on zero matches (the recorded negative result)", () => {
    expect(keywordAbstains(null, calibrated)).toBe(true);
    expect(keywordAbstains(0.0001, calibrated)).toBe(false);
  });

  it("a declared keyword floor gates strictly", () => {
    const config: AbstainConfig = { vectorFloor: null, keywordFloor: 0.1, floorDigest: null };
    expect(keywordAbstains(0.05, config)).toBe(true);
    expect(keywordAbstains(0.1, config)).toBe(false);
    expect(keywordAbstains(null, config)).toBe(true);
  });
});
