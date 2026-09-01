/**
 * The two quota refusals, told apart.
 *
 * Both were hit walking a real free-tier key, one after the other, and they
 * need OPPOSITE answers: the generation quota is a wall no wait clears, so the
 * remedy is the other door; the embedding quota is a per-minute window, so the
 * remedy is to wait. Getting them the wrong way round would send a reader to
 * sit out a limit that never lifts, or to rewrite their calibration over a
 * sixty-second pause.
 *
 * The messages are the vendor's, verbatim from those runs.
 */

import { describe, expect, it } from "vitest";

import { quotaRemedy } from "./quota.js";

const GENERATION =
  "Gemini API error 429: You exceeded your current quota, please check your plan and " +
  "billing details. * Quota exceeded for metric: " +
  "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, " +
  "model: gemini-2.5-flash Please retry in 29.696788738s.";

const EMBEDDING =
  "Gemini API error 429: Quota exceeded for " +
  "aiplatform.googleapis.com/global_embed_content_requests_per_minute_per_base_model " +
  "with base model: gemini-embedding. Please submit a quota increase request.";

describe("the generation quota", () => {
  it("sends the reader to the zero-LLM door, not to a wait", () => {
    const remedy = quotaRemedy(GENERATION);
    expect(remedy).not.toBeNull();
    expect(remedy).toContain("--queries-file");
    expect(remedy, "waiting does not clear a per-minute generation cap on a corpus").not.toMatch(
      /wait/i,
    );
  });

  it("says why a bigger corpus makes it worse, since that is the counter-intuitive part", () => {
    expect(quotaRemedy(GENERATION)).toMatch(/worse, not better/);
  });
});

describe("the embedding quota", () => {
  it("sends the reader to a wait, not to a different door", () => {
    const remedy = quotaRemedy(EMBEDDING);
    expect(remedy).not.toBeNull();
    expect(remedy).toMatch(/wait about a minute/i);
    expect(remedy, "changing door would not help — both doors embed").not.toContain(
      "--queries-file",
    );
  });

  it("names the ingest as the usual cause, because that is what spent the budget", () => {
    expect(quotaRemedy(EMBEDDING)).toMatch(/ingest/i);
  });

  it("says nothing was written, so a reader does not go looking for damage", () => {
    expect(quotaRemedy(EMBEDDING)).toMatch(/Nothing was written/i);
  });
});

describe("anything else", () => {
  it("gets no invented advice — the vendor's own message stands", () => {
    for (const other of [
      "Gemini API error 500: internal",
      "Gemini API error 403: API key not valid",
      "connect ECONNREFUSED 127.0.0.1:5432",
      "",
    ]) {
      expect(quotaRemedy(other), JSON.stringify(other)).toBeNull();
    }
  });

  it("does not fire on a 429 it cannot attribute", () => {
    // A quota this does not know is not one it can prescribe for. Better the
    // raw sentence than a confident wrong remedy.
    expect(quotaRemedy("Gemini API error 429: Quota exceeded for something else")).toBeNull();
  });
});
