/**
 * What the reaper is allowed to drop.
 *
 * `parseScratchName` is the only thing standing between "tidy up after an
 * interrupted run" and "drop somebody's database", so it is tested in the
 * refusing direction first: a name it refuses is left alone forever, a name it
 * accepts may be DROPPED. `ksor_` on its own is not evidence — an adopter's own
 * database on a shared cluster may well start that way.
 */

import { describe, expect, it } from "vitest";

import { REAP_AFTER_MS, parseScratchName } from "./lib/db-scratch.js";

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const stamp = (at: number): string => at.toString(36);

describe("parseScratchName accepts a scratch name", () => {
  it("reads the instant back out of the name", () => {
    const made = NOW - 5 * 60_000;
    const parsed = parseScratchName(`ksor_idle_${stamp(made)}_3f2c8e`, NOW);
    expect(parsed?.createdAtMs, "the stamp is the creation instant").toBe(made);
  });

  it("tolerates a multi-part slug", () => {
    // `ksor_governance_generation_…` — the slug is everything between the
    // prefix and the last two fields, so parsing has to come from the RIGHT.
    const parsed = parseScratchName(`ksor_governance_generation_${stamp(NOW)}_a1b2c3`, NOW);
    expect(parsed?.createdAtMs).toBe(NOW);
  });

  it("tolerates a digit in the slug, which the concurrency suite uses", () => {
    expect(parseScratchName(`ksor_role_race_4_${stamp(NOW)}_a1b2c3`, NOW)).not.toBeNull();
  });
});

describe("parseScratchName refuses anything it cannot prove is ours", () => {
  const refused: readonly (readonly [string, string])[] = [
    ["ksor_production", "a plausible adopter database — no stamp, no random suffix"],
    ["knowledge_base", "not even the prefix"],
    [`ksor_${stamp(NOW)}_a1b2c3`, "no slug at all, so a bare two-field name cannot qualify"],
    [`ksor_idle_${stamp(NOW)}_A1B2C3`, "uppercase — the suffix is lowercase hex or nothing"],
    [`ksor_idle_${stamp(NOW)}_a1b2c`, "five hex characters, not six"],
    [`ksor_idle_${stamp(NOW)}_a1b2c3d`, "seven hex characters, not six"],
    ["ksor_idle_notbase36!_a1b2c3", "a stamp that is not base36"],
    [`ksor_idle_${stamp(Date.UTC(2019, 0, 1))}_a1b2c3`, "an instant before this project existed"],
    [`ksor_idle_${stamp(NOW + 2 * 86_400_000)}_a1b2c3`, "two days in the future"],
    // A leaked database from BEFORE this grammar shipped. It is left alone on
    // purpose: the reaper cannot date it, and guessing is how it would drop
    // something that matters. Sweeping those is a one-off by hand.
    ["ksor_r19_1787829592", "the pre-#166 shape, found live on a developer cluster"],
  ];

  it.each(refused)("%s — %s", (name) => {
    expect(parseScratchName(name, NOW), `${name} must not be reapable`).toBeNull();
  });
});

describe("the shape guard rule 12 requires", () => {
  it("evaluates to a name the reaper can parse", () => {
    // The two halves of the contract meeting. Rule 12 makes every suite write
    // a name carrying `Date.now().toString(36)` and a `randomBytes` suffix;
    // this is that name, evaluated, being one the reaper recognises. The guard
    // asserts the same round trip itself, so a change to either side fails
    // twice rather than silently leaking every scratch database forever.
    const built = `ksor_idle_${Date.now().toString(36)}_${"3f2c8e"}`;
    expect(parseScratchName(built)).not.toBeNull();
  });
});

describe("the reaping window", () => {
  it("is long enough that a running suite is never a candidate", () => {
    // The db tier's own hook timeout is 180s and a full serial run is minutes,
    // so the window has to exceed a whole run by a wide margin — a database
    // dropped out from under a live suite is exactly the #166 failure, moved.
    expect(REAP_AFTER_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});
