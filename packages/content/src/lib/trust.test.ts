import { describe, expect, it } from "vitest";

import { type TrustTier } from "../record/profile.js";
import { parseTrustFloor, tierOrdinal, tightenTrustFloor, trustGucs } from "./trust.js";

describe("tierOrdinal", () => {
  it("is the inverse of ingest's derivation", () => {
    expect(tierOrdinal("unverified")).toBe(0);
    expect(tierOrdinal("machine-confirmed")).toBe(1);
    expect(tierOrdinal("human-reviewed")).toBe(2);
  });
});

describe("tierOrdinal", () => {
  it("REFUSES a value that is not a tier rather than returning -1", () => {
    // `indexOf` answered -1, and every caller treated that as a NUMBER: the GUC
    // became "-1" and the predicate `trust_tier >= -1` admitted the whole
    // record. The types say TrustTier; the values reaching it come off an
    // adopter-owned registration, which may type the parameter however it
    // likes.
    expect(() => tierOrdinal("bogus" as TrustTier)).toThrowError(
      /ksor-trust-floor-unknown.*bogus/s,
    );
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

  it("REFUSES an unrecognised REQUESTED floor instead of degrading to none", () => {
    // The failure this closes: `tierOrdinal` answered -1, `Math.max` reduced it
    // to the deployment's floor, and on a door configured with none the whole
    // record came back under `ok: true`. Measured live — `min_trust_tier:
    // "bogus"` returned the unverified document that `"human-reviewed"` had
    // just excluded. An argument path must not do the opposite of what the
    // environment path in this same file refuses.
    expect(() => tightenTrustFloor(undefined, "bogus" as TrustTier)).toThrowError(
      /ksor-trust-floor-unknown.*bogus/s,
    );
    expect(() => tightenTrustFloor("human-reviewed", "bogus" as TrustTier)).toThrowError(
      /ksor-trust-floor-unknown/,
    );
  });

  it("REFUSES a number that is not a tier ordinal, in either direction", () => {
    expect(() => tightenTrustFloor(undefined, -5)).toThrowError(/ksor-trust-floor-unknown.*-5/s);
    expect(() => tightenTrustFloor(undefined, 99)).toThrowError(/ksor-trust-floor-unknown/);
    expect(() => tightenTrustFloor(1.5, undefined)).toThrowError(/ksor-trust-floor-unknown/);
  });
});

describe("trustGucs", () => {
  it("carries the floor as the GUC the predicate reads", () => {
    expect(trustGucs("human-reviewed")).toEqual({ "app.min_trust_tier": "2" });
    expect(trustGucs(1)).toEqual({ "app.min_trust_tier": "1" });
  });

  it("REFUSES rather than writing a GUC no predicate can mean", () => {
    // This is the same leak through the other door: the serving scope builds
    // the GUC straight from the context's floor, so a bad value there never
    // reached tightenTrustFloor at all.
    expect(() => trustGucs("bogus" as TrustTier)).toThrowError(/ksor-trust-floor-unknown/);
    expect(() => trustGucs(-1)).toThrowError(/ksor-trust-floor-unknown/);
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
