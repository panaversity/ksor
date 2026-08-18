import { describe, expect, it } from "vitest";

import { unsupportedPlatform } from "./platform.js";

describe("platform floor", () => {
  it("refuses a Node older than 24, naming the version in hand", () => {
    const remedy = unsupportedPlatform("22.15.0");
    expect(remedy).toContain("ksor requires Node >= 24");
    expect(remedy).toContain("v22.15.0");
  });

  it("accepts 24 and everything after it", () => {
    for (const version of ["24.0.0", "24.4.1", "25.1.0", "v26.0.0", "130.0.0"]) {
      expect(unsupportedPlatform(version), version).toBeNull();
    }
  });

  it("never refuses on a version it cannot parse", () => {
    expect(unsupportedPlatform("unknown")).toBeNull();
  });
});
