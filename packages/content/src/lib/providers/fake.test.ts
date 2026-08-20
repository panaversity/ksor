import { describe, expect, it } from "vitest";
import { embedIntent } from "../embedding.js";
import { FAKE_EMBED_MODEL, FakeEmbeddingProvider } from "./fake.js";

function makeFake(dim = 8): FakeEmbeddingProvider {
  return new FakeEmbeddingProvider({
    dim,
    documentTaskLabel: "RETRIEVAL_DOCUMENT",
    queryTaskLabel: "RETRIEVAL_QUERY",
  });
}

describe("identity", () => {
  it("carries the clearly-fake model id — a fake space can never masquerade as a real one", () => {
    const p = makeFake();
    expect(p.providerId).toBe("fake");
    expect(p.modelId).toBe("fake-embed-001");
    expect(p.modelId).toBe(FAKE_EMBED_MODEL);
    expect(p.recipe).toBe("fake-embed-001/d8/RETRIEVAL_DOCUMENT");
  });
});

describe("determinism", () => {
  it("same input → the same vector, across separately built providers", async () => {
    const [a] = await makeFake().embed(["what is an ai agent"], { intent: "document" });
    const [b] = await makeFake().embed(["what is an ai agent"], { intent: "document" });
    expect(a, "vector: " + JSON.stringify(a?.slice(0, 3))).toBeDefined();
    expect(b).toEqual(a);
  });

  it("intent does not change the vector — a query embed of a document's text lands at cosine 1", async () => {
    const p = makeFake();
    const [doc] = await p.embed(["shared text"], { intent: "document" });
    const [qry] = await p.embed(["shared text"], { intent: "query" });
    expect(qry).toEqual(doc);
  });

  it("different text → a different vector", async () => {
    const p = makeFake();
    const [a] = await p.embed(["text one"], { intent: "document" });
    const [b] = await p.embed(["text two"], { intent: "document" });
    expect(a, "a: " + JSON.stringify(a?.slice(0, 3))).not.toEqual(b);
  });

  it("different dim → a different vector (dim is in the seed), of the right length", async () => {
    const [d8] = await makeFake(8).embed(["text"], { intent: "document" });
    const [d16] = await makeFake(16).embed(["text"], { intent: "document" });
    expect(d8?.length, "d8: " + JSON.stringify(d8)).toBe(8);
    expect(d16?.length).toBe(16);
    expect(d16?.slice(0, 8), "d16 prefix vs d8: " + JSON.stringify(d16?.slice(0, 3))).not.toEqual(
      d8,
    );
  });
});

describe("the adapter contract", () => {
  it("returns one RAW (non-unit-norm) finite vector per input; the framework normalizes it", async () => {
    const p = makeFake();
    const raw = await p.embed(["a", "b", "c"], { intent: "document" });
    expect(raw.length).toBe(3);
    for (const v of raw) {
      expect(v.length).toBe(8);
      expect(v.every(Number.isFinite), "vector: " + JSON.stringify(v)).toBe(true);
      expect(v.some((x) => x !== 0)).toBe(true); // never degenerate
    }
    const rawNorm = Math.sqrt((raw[0] ?? []).reduce((acc, x) => acc + x * x, 0));
    expect(Math.abs(rawNorm - 1), "raw norm: " + rawNorm).toBeGreaterThan(1e-6); // raw, like any adapter
    const [normalized] = await embedIntent(["a"], { provider: p, intent: "document" });
    const norm = Math.sqrt((normalized ?? []).reduce((acc, x) => acc + x * x, 0));
    expect(norm, "normalized norm: " + norm).toBeCloseTo(1.0, 12);
  });

  it("is retryable-never: a fake failure is a test bug, not a blip", () => {
    const p = makeFake();
    const transportish = Object.assign(new Error("blip"), { code: "ECONNRESET", status: 503 });
    expect(p.isRetryable(transportish)).toBe(false);
    expect(p.isRetryableQuery(transportish)).toBe(false);
    p.reset(); // a no-op, callable by the framework's retry path
  });
});
