import { describe, expect, it } from "vitest";

import { parseInstant } from "./instant.js";

/**
 * The instant a call ACTUALLY resolved to, so a failure prints the date the
 * value silently became rather than a bare `null` / number pair.
 */
function instantOf(value: string): string | null {
  const ms = parseInstant(value);
  return ms === null ? null : new Date(ms).toISOString();
}

describe("parseInstant — record spec §2.3", () => {
  it("reads an instant at every precision the profile allows", () => {
    expect(instantOf("2026-08-25T10:00Z")).toBe("2026-08-25T10:00:00.000Z");
    expect(instantOf("2026-08-25T10:00:00Z")).toBe("2026-08-25T10:00:00.000Z");
    expect(instantOf("2026-08-25T10:00:00.5Z")).toBe("2026-08-25T10:00:00.500Z");
    expect(instantOf("2026-08-25T15:30:00+05:30")).toBe("2026-08-25T10:00:00.000Z");
    expect(instantOf("2026-08-25T05:00:00-05:00")).toBe("2026-08-25T10:00:00.000Z");
  });

  it("null for anything that is not a string, a bare date, or an instant with no offset", () => {
    expect(parseInstant(undefined)).toBeNull();
    expect(parseInstant(1_756_116_000_000)).toBeNull();
    expect(parseInstant(new Date())).toBeNull();
    expect(instantOf("2026-08-25")).toBeNull();
    expect(instantOf("2026-08-25T10:00")).toBeNull();
    expect(instantOf("2026-08-25T10:00:00+0530")).toBeNull();
  });

  /**
   * The hole the offset rule left open. `Date.parse` does not refuse a day the
   * calendar does not have: it ROLLS it, so `2026-02-30T00:00Z` is the instant
   * `2026-03-02T00:00:00Z` — an `effective_from` embargoing to a date nobody
   * wrote, and a `deprecated_at` landing in a month the author never named.
   * That is the same silent substitution the regex exists to prevent, reached
   * through the value instead of the format (2026-08-25 review).
   */
  it("null for a day the calendar does not have, instead of the day it rolls to", () => {
    expect(instantOf("2026-02-30T00:00Z")).toBeNull();
    expect(instantOf("2026-02-29T00:00Z")).toBeNull();
    expect(instantOf("2026-04-31T09:00:00+02:00")).toBeNull();
    expect(instantOf("2026-06-31T00:00Z")).toBeNull();
  });

  it("keeps a real leap day — the rule is the calendar, not a fixed 28", () => {
    expect(instantOf("2024-02-29T00:00Z")).toBe("2024-02-29T00:00:00.000Z");
    expect(instantOf("2000-02-29T00:00Z")).toBe("2000-02-29T00:00:00.000Z");
    expect(instantOf("2026-01-31T00:00Z")).toBe("2026-01-31T00:00:00.000Z");
    expect(instantOf("2026-04-30T00:00Z")).toBe("2026-04-30T00:00:00.000Z");
  });

  /** `T24:00` is a legal ISO 8601 end-of-day, and it is the NEXT day's instant. */
  it("null for the 24:00 end-of-day form, which is a different date", () => {
    expect(instantOf("2026-08-25T24:00Z")).toBeNull();
    expect(instantOf("2026-08-25T24:00:00-03:00")).toBeNull();
  });

  /** Already refused before this rule, and pinned so a rewrite cannot lose them. */
  it("null for an out-of-range month, day, minute, second or offset", () => {
    expect(instantOf("2026-13-01T00:00Z")).toBeNull();
    expect(instantOf("2026-00-01T00:00Z")).toBeNull();
    expect(instantOf("2026-01-00T00:00Z")).toBeNull();
    expect(instantOf("2026-01-32T00:00Z")).toBeNull();
    expect(instantOf("2026-01-01T23:60Z")).toBeNull();
    expect(instantOf("2026-01-01T23:59:60Z")).toBeNull();
    expect(instantOf("2026-01-01T00:00+99:00")).toBeNull();
  });
});
