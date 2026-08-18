import { describe, expect, it } from "vitest";

import { isValidName, nameProblem, suggestName } from "./name.js";

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

  it("rejects the Windows device names the grammar would otherwise allow", () => {
    for (const name of ["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"]) {
      expect(isValidName(name), name).toBe(false);
    }
    // Only the exact device name is unusable — a longer name is fine.
    for (const name of ["console", "com10", "com0", "nullable"]) {
      expect(isValidName(name), name).toBe(true);
    }
  });

  it("names which rule rejected a name, so the refusal cannot blame the wrong one", () => {
    expect(nameProblem("con")).toBe("windows-reserved");
    expect(nameProblem("UPPER")).toBe("grammar");
    expect(nameProblem("my-sor")).toBeNull();
  });

  it("suggests a usable slug from a near-miss", () => {
    expect(suggestName("My SOR!")).toBe("my-sor");
    expect(suggestName("Under_Score")).toBe("under-score");
    expect(suggestName("---")).toBeNull();
  });

  it("never suggests a name the grammar would reject", () => {
    for (const input of ["CON", "aux", "LPT1"]) {
      const suggestion = suggestName(input) ?? "";
      expect(isValidName(suggestion), `${input} -> ${suggestion}`).toBe(true);
    }
  });
});
