/**
 * What a store failure SAYS, before anything decides what to do about it.
 *
 * The class name is the only diagnostic that survives sanitization — a driver
 * error's own text names the host, the port and the database user — so the
 * parenthetical carrying it has to be worth reading.
 */

import { describe, expect, it } from "vitest";

import { ContentStoreError } from "./db.js";

describe("ContentStoreError names the failure class only when the class says something", () => {
  // `pg` reports most connection failures as a bare `Error`, so the
  // parenthetical rendered "(Error)": a suffix that looks like a truncated
  // diagnostic and carries nothing. The sibling pool line, "idle client error
  // (error 57P01)", is useful precisely because its parenthetical identifies
  // the failure (resilience walk, 2026-08-25).
  it("drops a parenthetical that would say only `Error`", () => {
    expect(new ContentStoreError("Error").message).toBe("content store temporarily unavailable");
  });

  it("keeps one that identifies the failure", () => {
    expect(new ContentStoreError("PoolTimeoutError").message).toContain("(PoolTimeoutError)");
  });
});
