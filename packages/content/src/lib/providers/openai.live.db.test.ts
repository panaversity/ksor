/**
 * The one live call to OpenAI, mirroring `gemini.live.db.test.ts`.
 *
 * Everything else in the suite uses the deterministic fake provider on purpose
 * — gating tests must not depend on a paid, rate-limited, non-deterministic
 * service. But that leaves "the seam is vendor-neutral" (issue #25) resting on
 * a stub, which proves the shape and not the space. This is the proof, and the
 * tripwire for vendor drift: a response-shape or dimensionality change surfaces
 * here rather than in an adopter's ingest.
 *
 * Gated on OPENAI_API_KEY: skipped without it.
 *
 * The `.db.` in the name is the TIER, not the dependency — this suite touches
 * no database, and it lives here for the same reason the Gemini one does: the
 * tier that is allowed to reach a paid network service.
 */

import { describe, expect, it } from "vitest";

import { buildShippedProvider } from "./registry.js";

const apiKey = process.env["OPENAI_API_KEY"] ?? "";
// `text-embedding-3-*` supports dimension reduction, and the seam must honour
// what it is asked for rather than whatever the vendor defaults to.
const DIM = 256;

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

describe.runIf(apiKey !== "")("openai provider — live", () => {
  it("embeds through the seam at the requested dimension, in a real semantic space", async () => {
    const provider = buildShippedProvider("openai", {
      apiKey,
      modelId: "text-embedding-3-small",
      dim: DIM,
    });
    const [retention, deletion, unrelated] = await provider.embed(
      [
        "Employee records are retained for seven years after departure.",
        "Personnel files are deleted seven years after someone leaves.",
        "The tectonic plates beneath the Pacific drift a few centimetres a year.",
      ],
      { intent: "document" },
    );

    // Shape: the seam delivers exactly the dimension the corpus declares — a
    // silent vendor default would not fit the vector(N) column.
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

    // Semantics: what "a real embedding space" MEANS. The deterministic fake
    // provider cannot express this — it is exact-text hashing — so only a live
    // call can prove the property an abstention floor is calibrated against.
    const near = cosine(retention ?? [], deletion ?? []);
    const far = cosine(retention ?? [], unrelated ?? []);
    expect(near, `paraphrase cosine ${near} vs unrelated ${far}`).toBeGreaterThan(far);
  }, 60_000);

  it("is SYMMETRIC — the same text embeds alike whatever the intent", async () => {
    // The property that makes this vendor's empty task labels correct. Gemini
    // is asymmetric by design (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY`), and
    // if OpenAI ever gained a task type, the registry's `taskLabels: {"",""}`
    // would start describing a space it no longer produced — this is the
    // tripwire for that.
    const provider = buildShippedProvider("openai", {
      apiKey,
      modelId: "text-embedding-3-small",
      dim: DIM,
    });
    const text = "Employee records are retained for seven years after departure.";
    const [asDocument] = await provider.embed([text], { intent: "document" });
    const [asQuery] = await provider.embed([text], { intent: "query" });
    expect(
      cosine(asDocument ?? [], asQuery ?? []),
      "one text, two intents, one space",
    ).toBeGreaterThan(0.999);
  }, 60_000);

  it("reports a recipe that names the space it actually used", async () => {
    // It read `RETRIEVAL_DOCUMENT` — Gemini's label, on an OpenAI space —
    // until the task labels moved onto the registry row. The recipe is what an
    // operator reads in the ingest log to know what was built.
    const provider = buildShippedProvider("openai", {
      apiKey,
      modelId: "text-embedding-3-small",
      dim: DIM,
    });
    expect(provider.recipe).toBe(`text-embedding-3-small/d${DIM}/`);
    expect(provider.recipe, "no other vendor's task label").not.toContain("RETRIEVAL");
  });
});
