import { describe, expect, it } from "vitest";

import { isValidName, suggestName } from "./name.js";

describe("name grammar", () => {
  it("accepts the spec's shape", () => {
    for (const name of ["a", "my-sor", "accounting-sor", "a1-b2", "x".repeat(63)]) {
      expect(isValidName(name), name).toBe(true);
    }
  });

  it("rejects everything outside the grammar", () => {
    for (const name of [
      "",
      "-leading",
      "UPPER",
      "spaces here",
      "under_score",
      "dots.here",
      "x".repeat(64),
      "émoji",
    ]) {
      expect(isValidName(name), name).toBe(false);
    }
  });

  it("suggests a usable slug from a near-miss", () => {
    expect(suggestName("My SOR!")).toBe("my-sor");
    expect(suggestName("Under_Score")).toBe("under-score");
    expect(suggestName("---")).toBeNull();
  });
});
