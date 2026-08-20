import { afterEach, describe, expect, it, vi } from "vitest";

import { envFloat, envInt } from "./env.js";

const KEY = "KSOR_TEST_ENV_PARSE";
afterEach(() => {
  delete process.env[KEY];
  vi.restoreAllMocks();
});

describe("envFloat — strict parse, fail-soft (review 2026-08-19)", () => {
  // Number.parseFloat used to accept "15%" → 15 and "15abc" → 15; a lax value
  // silently disabled the KSOR_MAX_SHRINK guard. A malformed value must fall
  // back to the default, matching envInt.
  const cases: [string | undefined, number][] = [
    [undefined, 0.15], // unset → default
    ["", 0.15], // blank → default
    ["   ", 0.15], // whitespace → default
    ["0.5", 0.5], // plain fraction
    ["15", 15], // valid float (the [0,1] range guard lives at the call site)
    ["1e-3", 0.001], // scientific notation
    ["  0.25  ", 0.25], // trimmed
    ["15%", 0.15], // trailing garbage → default (the reported bug)
    ["15abc", 0.15], // trailing garbage → default
    ["abc", 0.15], // non-numeric → default
    ["Infinity", 0.15], // not a finite decimal literal → default
    ["NaN", 0.15], // → default
  ];
  for (const [raw, expected] of cases) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      if (raw === undefined) delete process.env[KEY];
      else process.env[KEY] = raw;
      expect(envFloat(KEY, 0.15, 0.0)).toBe(expected);
    });
  }

  it("clamps a valid value below the minimum, not the malformed ones", () => {
    process.env[KEY] = "-0.2";
    expect(envFloat(KEY, 0.15, 0.0)).toBe(0); // valid float, below min → min
  });
});

describe("envInt — still strict (regression)", () => {
  it("rejects trailing garbage, accepts integers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env[KEY] = "12abc";
    expect(envInt(KEY, 64)).toBe(64);
    process.env[KEY] = "128";
    expect(envInt(KEY, 64)).toBe(128);
  });
});
