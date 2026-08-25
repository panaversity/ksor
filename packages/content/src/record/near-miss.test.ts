import { describe, expect, it } from "vitest";

import { distance, nearest } from "./near-miss.js";

/** One implementation behind two closed key sets — the concept's and the policy's. */
describe("near-miss", () => {
  it("counts one edit as one", () => {
    expect(distance("stale_after", "stale_afer")).toBe(1);
    expect(distance("scope", "path")).toBeGreaterThan(2);
  });

  it("offers the closest allowed key, and nothing when none is close", () => {
    const allowed = ["scope", "actors"];
    expect(nearest("actor", allowed, 2)).toBe("actors");
    expect(nearest("path", allowed, 2)).toBeNull();
  });

  it("says nothing about a key that IS allowed — the caller filters those, and a match is not a miss", () => {
    expect(nearest("scope", ["scope", "actors"], 2)).toBeNull();
  });

  it("prefers the nearer of two candidates, whatever their order", () => {
    expect(nearest("ownershp", ["ownership", "owner"], 2)).toBe("ownership");
    expect(nearest("ownershp", ["owner", "ownership"], 2)).toBe("ownership");
  });
});
