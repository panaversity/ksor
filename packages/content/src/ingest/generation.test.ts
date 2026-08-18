/**
 * The pure algebra of the generational lifecycle: the ready gate, the shrink
 * guard, and the carry-forward match key — each factored out of the SQL so
 * the policy is pinned without a database.
 */

import { describe, expect, it } from "vitest";

import {
  ABANDONED_AFTER_MS,
  addedSlugs,
  carryKeyMatches,
  GC_GRACE_MS,
  generationReady,
  MAX_FAILED_FRACTION,
  MIN_COMPLETE_GENERATIONS,
  removedSlugs,
  shrinkFraction,
  shrinkUnsafe,
  type CarryKey,
  type FlipDelta,
} from "./generation.js";

describe("constants (oracle generation.py values, exactly)", () => {
  it("carries the §5 numbers", () => {
    expect(GC_GRACE_MS, "TOKEN_TTL 30min + 10min").toBe(40 * 60 * 1000);
    expect(MIN_COMPLETE_GENERATIONS).toBe(2);
    expect(ABANDONED_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAX_FAILED_FRACTION).toBe(0.02);
  });
});

describe("ready gate", () => {
  const health = (embedded: number, pending: number, failed: number) => ({
    generation: 1,
    embedded,
    pending,
    failed,
  });

  it("refuses any pending — the queue must fully drain", () => {
    expect(generationReady(health(100, 1, 0))).toBe(false);
  });

  it("refuses zero embedded — an empty generation never serves", () => {
    expect(generationReady(health(0, 0, 0))).toBe(false);
    expect(generationReady(health(0, 0, 5)), "all-failed is not ready").toBe(false);
  });

  it("tolerates a failed fraction up to exactly 2%", () => {
    // 1 failed / 50 total == 0.02 — the boundary is INCLUSIVE (<=).
    expect(generationReady(health(49, 0, 1)), "1/50 == 2% must pass").toBe(true);
    // 1 failed / 10 total == 10% — the fixture-tree case: one poison chunk withholds readiness.
    expect(generationReady(health(9, 0, 1)), "1/10 == 10% must refuse").toBe(false);
    // 1 / 60 ≈ 1.7% — under the floor.
    expect(generationReady(health(59, 0, 1))).toBe(true);
  });

  it("a clean drain is ready", () => {
    expect(generationReady(health(10, 0, 0))).toBe(true);
  });
});

describe("shrink guard", () => {
  it("a first ingest never trips (nothing to shrink from)", () => {
    expect(shrinkFraction(0, 10)).toBe(0);
    expect(shrinkUnsafe(0, 0, 0.15)).toBe(false);
  });

  it("growth is never a shrink", () => {
    expect(shrinkFraction(10, 12)).toBe(0);
    expect(shrinkUnsafe(10, 12, 0.15)).toBe(false);
  });

  it("measures the net fractional drop and compares strictly", () => {
    expect(shrinkFraction(10, 8)).toBeCloseTo(0.2);
    expect(shrinkUnsafe(10, 8, 0.15), "20% > 15%").toBe(true);
    // Exactly at the threshold is tolerated (strict >, as the oracle).
    expect(shrinkUnsafe(20, 17, 0.15), "15% == 15% must not trip").toBe(false);
  });

  it("a pure rename (one removed + one added) never trips — count-based by design", () => {
    const delta: FlipDelta = {
      priorGeneration: 1,
      priorSlugs: new Set(["a", "b", "c"]),
      newSlugs: new Set(["a", "b", "c-renamed"]),
    };
    expect(removedSlugs(delta)).toEqual(["c"]);
    expect(addedSlugs(delta)).toEqual(["c-renamed"]);
    expect(shrinkUnsafe(delta.priorSlugs.size, delta.newSlugs.size, 0.15)).toBe(false);
  });

  it("added/removed are sorted set differences", () => {
    const delta: FlipDelta = {
      priorGeneration: 3,
      priorSlugs: new Set(["z", "m", "a"]),
      newSlugs: new Set(["m", "b", "y"]),
    };
    expect(addedSlugs(delta)).toEqual(["b", "y"]);
    expect(removedSlugs(delta)).toEqual(["a", "z"]);
  });
});

describe("carry-forward match key (the SQL predicate, pinned)", () => {
  const key = (over: Partial<CarryKey> = {}): CarryKey => ({
    chunkHash: "h1",
    headingPathText: "part-1/intro",
    nodeTitle: "Course",
    embeddingModel: "fake-embed-001",
    ...over,
  });

  it("matches only when ALL four fields agree — everything feeding embedInput plus the model", () => {
    expect(carryKeyMatches(key(), key())).toBe(true);
    expect(carryKeyMatches(key(), key({ chunkHash: "h2" })), "content changed").toBe(false);
    expect(
      carryKeyMatches(key(), key({ headingPathText: "part-1/setup" })),
      "heading path changed",
    ).toBe(false);
    expect(carryKeyMatches(key(), key({ nodeTitle: "Course v2" })), "node title changed").toBe(
      false,
    );
    expect(
      carryKeyMatches(key(), key({ embeddingModel: "gemini-embedding-001" })),
      "the R-1 gate: a model bump must re-embed, never carry",
    ).toBe(false);
  });

  it("heading_path_text is NULL-safe (IS NOT DISTINCT FROM): null matches null, never a string", () => {
    expect(carryKeyMatches(key({ headingPathText: null }), key({ headingPathText: null }))).toBe(
      true,
    );
    expect(carryKeyMatches(key({ headingPathText: null }), key({ headingPathText: "" }))).toBe(
      false,
    );
  });
});
