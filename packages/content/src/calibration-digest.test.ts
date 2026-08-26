/**
 * A floor is a threshold inside ONE retrieval predicate. When the predicate
 * changes — a lifecycle window, a trust floor, a section branch, a denial
 * scope — the same question reaches a different candidate set, so the measured
 * separation the floor encodes is no longer the separation the door has. The
 * number stays plausible and stops meaning what it said.
 *
 * So calibration records the digest of the predicate it ran under beside the
 * floor, and the door compares it at boot. A mismatch is NOT "gate: off" —
 * that would answer out-of-corpus questions with confident citations — it is
 * the EXISTING declared-but-uncalibrated refusal, whose remedy is already
 * `ksor calibrate`.
 */

import { describe, expect, it } from "vitest";

import { GATE_PREDICATE_DIGEST } from "./lib/search.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import {
  gateState,
  outlineDocuments,
  readDocument,
  search,
  UncalibratedFloorError,
  type ServiceContext,
} from "./service.js";

const context = (
  vectorFloor: number | null | "uncalibrated",
  floorDigest: string | null,
): ServiceContext =>
  ({
    pool: {} as never, // never reached — the refusal is before any DB call
    instance: {
      name: "c",
      corpusId: "c",
      tenantId: "c",
      dsnEnv: "X",
      abstain: { vectorFloor, keywordFloor: null, floorDigest },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: 8,
    },
    ring: keyRingFromEnv(undefined),
    instanceDigest: "d",
    embedQuery: async () => [0, 1],
  }) as unknown as ServiceContext;

describe("a floor measured under a DIFFERENT predicate refuses, exactly as an unmeasured one does", () => {
  const stale = context(0.62, "0000deadbeef");

  it("search refuses before touching the database", async () => {
    await expect(search(stale, "anything", 5)).rejects.toBeInstanceOf(UncalibratedFloorError);
  });

  it("read and outline refuse too — a stale floor is not a serving state", async () => {
    await expect(readDocument(stale, "any-slug")).rejects.toBeInstanceOf(UncalibratedFloorError);
    await expect(outlineDocuments(stale, {})).rejects.toBeInstanceOf(UncalibratedFloorError);
  });

  it("the refusal names the predicate change and the fix, not just the slug", async () => {
    const error = await search(stale, "anything", 5).then(
      () => new Error("search did NOT refuse"),
      (e: Error) => e,
    );
    expect(error.message).toContain("ksor-uncalibrated");
    expect(error.message, error.message).toContain("0000deadbeef");
    expect(error.message).toContain(GATE_PREDICATE_DIGEST);
    expect(error.message).toContain("ksor calibrate");
  });

  it("the wire says `uncalibrated`, NEVER `off` — a stale floor must not read as a ladder rung", () => {
    expect(gateState(stale.instance)).toBe("uncalibrated");
  });
});

describe("what does NOT refuse", () => {
  it("a floor whose digest is the serving predicate's serves", () => {
    expect(gateState(context(0.62, GATE_PREDICATE_DIGEST).instance)).toEqual({ floor: 0.62 });
  });

  it("a record that declares NO floor keeps the gate honestly off", () => {
    // Governance is a ladder: nothing was measured, so nothing can be stale.
    expect(gateState(context(null, null).instance)).toBe("off");
  });

  it("a floor with no digest at all is treated as measured under a predicate we cannot name", async () => {
    // Every floor calibrated before the digest existed was measured without
    // the lifecycle window and the trust floor — the exact staleness this
    // mechanism exists to catch, so absence refuses rather than passes.
    await expect(search(context(0.62, null), "anything", 5)).rejects.toBeInstanceOf(
      UncalibratedFloorError,
    );
  });

  /**
   * The VALUE, not the shape. A shape assertion cannot fail, and this is the
   * one number in the tree that a whitespace-only edit can invalidate in the
   * field: every `ksor calibrate` writes it into the adopter's `instance.md`
   * as `retrieval.floor_digest`, and the door compares it at boot, so a
   * reflow of the predicate that changes no SQL semantics still makes every
   * calibrated record refuse until it is re-measured.
   *
   * Changing this number is therefore a deliberate act with a migration
   * attached, never a side effect of tidying. If this line goes red and you
   * did not mean to change what the gate selects, revert the formatting.
   */
  it("the digest is exactly the value adopters have measured against", () => {
    expect(GATE_PREDICATE_DIGEST).toMatch(/^[0-9a-f]{12}$/);
    expect(
      GATE_PREDICATE_DIGEST,
      "the serving predicate changed — every floor measured through the old one is stale; " +
        "if that was intended, say so in the changeset and tell adopters to re-run `ksor calibrate`",
    ).toBe("8bfb07d0e6f5");
  });
});
