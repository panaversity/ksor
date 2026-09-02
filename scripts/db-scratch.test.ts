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

import { REAP_AFTER_MS, parseScratchName, sampleScratchName } from "./lib/db-scratch.js";

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

describe("sampleScratchName evaluates the expression a suite wrote", () => {
  // Written as source text, not as a template literal this file would itself
  // evaluate: the sampler's input is what the guard captures from a suite.
  const STAMP = "${Date.now().toString(36)}";
  const RANDOM = '${randomBytes(3).toString("hex")}';

  it("turns the tier's literal into the name that suite will mint", () => {
    const sample = sampleScratchName("`ksor_idle_" + STAMP + "_" + RANDOM + "`", NOW);
    expect(sample).toBe(`ksor_idle_${stamp(NOW)}_012345`);
    expect(parseScratchName(sample ?? "", NOW)?.createdAtMs).toBe(NOW);
  });

  it("evaluates the join form the reaper suite assembles by hand", () => {
    const sample = sampleScratchName(
      '["ksor", slug, (Date.now() - agoMs).toString(36), randomBytes(3).toString("hex")].join("_")',
      NOW,
    );
    expect(sample).toBe(`ksor_x_${stamp(NOW)}_012345`);
    expect(parseScratchName(sample ?? "", NOW)).not.toBeNull();
  });

  it("stands an interpolation it cannot evaluate in as slug material", () => {
    const sample = sampleScratchName("`ksor_role_race_${n}_" + STAMP + "_" + RANDOM + "`", NOW);
    expect(sample).toBe(`ksor_role_race_x_${stamp(NOW)}_012345`);
    expect(parseScratchName(sample ?? "", NOW)).not.toBeNull();
  });

  it("gives randomBytes(2) its real four hex characters, which the reaper refuses", () => {
    // The defect this exists for: `randomBytes(` is present, so a text check
    // passes, and the name it mints is one no reaper will ever drop.
    const sample = sampleScratchName(
      "`ksor_idle_" + STAMP + '_${randomBytes(2).toString("hex")}`',
      NOW,
    );
    expect(sample).toBe(`ksor_idle_${stamp(NOW)}_0123`);
    expect(parseScratchName(sample ?? "", NOW)).toBeNull();
  });

  it("gives a trailing interpolation its place, where it displaces the random field", () => {
    const sample = sampleScratchName("`ksor_idle_" + STAMP + "_" + RANDOM + "_${suffix}`", NOW);
    expect(sample).toBe(`ksor_idle_${stamp(NOW)}_012345_x`);
    expect(parseScratchName(sample ?? "", NOW)).toBeNull();
  });

  it("answers null for an expression that is neither shape", () => {
    expect(sampleScratchName('"ksor_idle_test"', NOW)).toBeNull();
    expect(sampleScratchName("scratchDb()", NOW)).toBeNull();
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
