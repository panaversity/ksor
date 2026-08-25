import { describe, expect, it } from "vitest";

import { parseTrustFloor, tierOrdinal, tightenTrustFloor, trustGucs } from "./trust.js";

describe("tierOrdinal", () => {
  it("is the inverse of ingest's derivation", () => {
    expect(tierOrdinal("unverified")).toBe(0);
    expect(tierOrdinal("machine-confirmed")).toBe(1);
    expect(tierOrdinal("human-reviewed")).toBe(2);
  });
});

describe("tightenTrustFloor", () => {
  it("defaults to unverified when neither side names one", () => {
    expect(tightenTrustFloor(undefined, undefined)).toBe(0);
  });

  it("honours a caller's floor above the deployment's", () => {
    expect(tightenTrustFloor(undefined, "human-reviewed")).toBe(2);
    expect(tightenTrustFloor("unverified", "machine-confirmed")).toBe(1);
  });

  it("NEVER lets a caller loosen the deployment's floor", () => {
    expect(tightenTrustFloor("human-reviewed", "unverified")).toBe(2);
    expect(tightenTrustFloor("machine-confirmed", undefined)).toBe(1);
    expect(tightenTrustFloor(2, 0)).toBe(2);
  });
});

describe("trustGucs", () => {
  it("carries the floor as the GUC the predicate reads", () => {
    expect(trustGucs("human-reviewed")).toEqual({ "app.min_trust_tier": "2" });
    expect(trustGucs(1)).toEqual({ "app.min_trust_tier": "1" });
  });
});

describe("parseTrustFloor", () => {
  it("is unverified when unset — the honest default, not a weakness", () => {
    expect(parseTrustFloor(undefined)).toBe("unverified");
    expect(parseTrustFloor("")).toBe("unverified");
    expect(parseTrustFloor("  human-reviewed \n")).toBe("human-reviewed");
  });

  it("REFUSES a tier it does not recognise rather than falling back", () => {
    // A fallback here serves the half the operator meant to hold back, from a
    // typo, with a green boot.
    expect(() => parseTrustFloor("human_reviewed")).toThrowError(
      /ksor-trust-floor-unknown.*human_reviewed/s,
    );
  });
});
