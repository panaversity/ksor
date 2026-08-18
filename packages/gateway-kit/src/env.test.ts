import { describe, expect, it, vi } from "vitest";

import { envInt } from "./env.js";

describe("envInt — fail-soft tuning knobs (a knob must never take serving down)", () => {
  it("parses a well-formed value", () => {
    expect(envInt({ K: "2048" }, "K", 1)).toBe(2048);
  });

  it("falls back on unset or blank, silently", () => {
    const warn = vi.fn();
    expect(envInt({}, "K", 7, { warn })).toBe(7);
    expect(envInt({ K: "  " }, "K", 7, { warn })).toBe(7);
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back on a malformed value, warning with the variable's name", () => {
    const warn = vi.fn();
    expect(envInt({ K: "1MB" }, "K", 9, { warn })).toBe(9);
    expect(envInt({ K: "1.5" }, "K", 9, { warn })).toBe(9);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("K="));
  });

  it("clamps below the minimum instead of resetting — the operator meant it low", () => {
    const warn = vi.fn();
    expect(envInt({ K: "10" }, "K", 1_000_000, { minimum: 1024, warn })).toBe(1024);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamping"));
  });
});
