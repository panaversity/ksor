/**
 * The ONE live call to the real embedding vendor. Everything else in the suite
 * uses the deterministic fake provider on purpose (gating tests must not depend
 * on a paid, rate-limited, non-deterministic service) — but that leaves the
 * decision-11 claim "retrieval runs in a real embedding space through the
 * merged provider seam" resting on nothing automated. This is that proof, and
 * the tripwire for vendor API drift (an SDK response-shape or dimensionality
 * change surfaces here, not in an adopter's ingest).
 *
 * Gated on GEMINI_API_KEY: skipped locally without it, run in CI, which
 * carries the secret.
 */

import { describe, expect, it } from "vitest";

import { buildShippedProvider } from "./registry.js";

const apiKey = process.env["GEMINI_API_KEY"] ?? "";
// Small enough to keep the call cheap; the vendor supports output
// dimensionality reduction, and the seam must honor what it is asked for.
const DIM = 768;

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

describe.runIf(apiKey !== "")("gemini provider — live", () => {
  it("embeds through the seam at the requested dimension, in a real semantic space", async () => {
    const provider = buildShippedProvider("gemini", { apiKey, dim: DIM });
    const [retention, deletion, unrelated] = await provider.embed(
      [
        "Employee records are retained for seven years after departure.",
        "Personnel files are deleted seven years after someone leaves.",
        "The tectonic plates beneath the Pacific drift a few centimetres a year.",
      ],
      { intent: "document" },
    );

    // Shape: the seam must deliver exactly the dimension the corpus declares —
    // a silent vendor default would not fit the vector(N) column.
    for (const [name, vec] of [
      ["retention", retention],
      ["deletion", deletion],
      ["unrelated", unrelated],
    ] as const) {
      expect(vec, `${name} vector present`).toBeDefined();
      expect(vec?.length, `${name} dimension`).toBe(DIM);
      expect(
        vec?.every((v) => Number.isFinite(v)),
        `${name} vectors are finite`,
      ).toBe(true);
    }

    // Semantics: this is what "a real embedding space" MEANS — a paraphrase
    // must sit closer than an unrelated sentence. The deterministic fake
    // provider cannot express this (it is exact-text hashing), so only a live
    // call can prove the property the abstention floor is calibrated against.
    const near = cosine(retention ?? [], deletion ?? []);
    const far = cosine(retention ?? [], unrelated ?? []);
    expect(near, `paraphrase cosine ${near} vs unrelated ${far}`).toBeGreaterThan(far);
  }, 60_000);
});

describe.runIf(apiKey === "")("gemini provider — live (gated)", () => {
  it("skipped — set GEMINI_API_KEY to run the live embedding-space proof", () => {
    expect(apiKey).toBe("");
  });
});
