import { describe, expect, it } from "vitest";
import {
  EMBED_DIM,
  EMBED_MODEL,
  EMBED_RECIPE,
  EMBED_TASK_DOCUMENT,
  EMBED_TASK_QUERY,
} from "../../config.js";
import { FAKE_EMBED_MODEL, FakeEmbeddingProvider } from "./fake.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import {
  buildShippedProvider,
  MissingProviderKeyError,
  PROVIDERS,
  providerNeedsApiKey,
} from "./registry.js";

describe("the registry rows", () => {
  it("ships exactly these entries, with the right key posture and key variable", () => {
    expect(Object.keys(PROVIDERS).sort(), JSON.stringify(Object.keys(PROVIDERS))).toEqual([
      "fake",
      "gemini",
      "openai",
    ]);
    expect(PROVIDERS["gemini"]?.needsApiKey).toBe(true);
    expect(PROVIDERS["openai"]?.needsApiKey).toBe(true);
    expect(PROVIDERS["fake"]?.needsApiKey).toBe(false);

    // The variable is the registry's to name, not a composition root's — the
    // defect issue #25 records. A key-free provider names none, so a root that
    // reads `process.env[keyEnv]` cannot accidentally require one.
    expect(PROVIDERS["gemini"]?.keyEnv).toBe("GEMINI_API_KEY");
    expect(PROVIDERS["openai"]?.keyEnv).toBe("OPENAI_API_KEY");
    expect(PROVIDERS["fake"]?.keyEnv).toBeNull();
  });

  it("gives every key-needing provider a DISTINCT variable", () => {
    // Two vendors sharing one variable would silently hand one vendor's key to
    // the other, which fails as an authentication error naming the wrong
    // product.
    const envs = Object.values(PROVIDERS)
      .filter((e) => e.needsApiKey)
      .map((e) => e.keyEnv);
    expect(envs.every((e) => typeof e === "string" && e.length > 0)).toBe(true);
    expect(new Set(envs).size, JSON.stringify(envs)).toBe(envs.length);
  });

  it("refuses an unknown name loudly, naming the registered set", () => {
    expect(() => buildShippedProvider("anthropic", { apiKey: "k" })).toThrow(
      'unknown embedding provider "anthropic" — registered: fake, gemini, openai',
    );
    expect(() => providerNeedsApiKey("typo")).toThrow(/unknown embedding provider/);
  });

  it("answers the key question first, same refusal on a typo", () => {
    expect(providerNeedsApiKey("gemini")).toBe(true);
    expect(providerNeedsApiKey("fake")).toBe(false);
  });
});

describe("buildShippedProvider — the one door", () => {
  it("refuses a key-needing provider without its key (null AND empty string)", () => {
    for (const apiKey of [null, ""]) {
      expect(
        () => buildShippedProvider("gemini", { apiKey }),
        "apiKey: " + JSON.stringify(apiKey),
      ).toThrow('embedding provider "gemini" needs an API key and none was supplied');
    }
  });

  it("throws a TYPED MissingProviderKeyError so callers classify by type, not prose", () => {
    // The gateway maps THIS type → exit 3 (compose.ts); a reworded message
    // must not silently revert that to exit 1 (review 2026-08-19).
    expect(() => buildShippedProvider("gemini", { apiKey: null })).toThrow(MissingProviderKeyError);
    try {
      buildShippedProvider("gemini", { apiKey: null });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingProviderKeyError);
      expect((error as MissingProviderKeyError).providerName).toBe("gemini");
    }
  });

  it("binds gemini to the shipped eval-locked space; building never touches the SDK client", () => {
    const p = buildShippedProvider("gemini", { apiKey: "unused" }); // lazily built client — no network
    expect(p).toBeInstanceOf(GeminiEmbeddingProvider);
    expect(p.modelId).toBe(EMBED_MODEL);
    expect(p.dim).toBe(EMBED_DIM);
    expect(p.documentTaskLabel).toBe(EMBED_TASK_DOCUMENT);
    expect(p.queryTaskLabel).toBe(EMBED_TASK_QUERY);
    expect(p.recipe, "recipe: " + p.recipe).toBe(EMBED_RECIPE); // byte-equals the config recipe
  });

  it("honors a declared space override (modelId / dim)", () => {
    const p = buildShippedProvider("gemini", {
      apiKey: "unused",
      modelId: "other-model",
      dim: 768,
    });
    expect(p.modelId).toBe("other-model");
    expect(p.dim).toBe(768);
    expect(p.recipe).toBe("other-model/d768/RETRIEVAL_DOCUMENT");
  });

  it("builds the fake key-free, with the shipped labels and dim", () => {
    const p = buildShippedProvider("fake", { apiKey: null });
    expect(p).toBeInstanceOf(FakeEmbeddingProvider);
    expect(p.dim).toBe(EMBED_DIM);
    expect(p.documentTaskLabel).toBe(EMBED_TASK_DOCUMENT);
    expect(p.queryTaskLabel).toBe(EMBED_TASK_QUERY);
  });

  it("never lets the fake carry a real model id — even through the defaulted build", () => {
    // the door defaults modelId to EMBED_MODEL for every provider; the fake
    // must ignore it, or a fake-embedded space could masquerade as the real one
    expect(buildShippedProvider("fake", { apiKey: null }).modelId).toBe(FAKE_EMBED_MODEL);
    expect(buildShippedProvider("fake", { apiKey: null, modelId: EMBED_MODEL }).modelId).toBe(
      FAKE_EMBED_MODEL,
    );
    const p = buildShippedProvider("fake", { apiKey: null, dim: 8 });
    expect(p.dim, "dim override: " + p.dim).toBe(8); // dim IS honored — it must match the schema under test
    expect(p.recipe).toBe("fake-embed-001/d8/RETRIEVAL_DOCUMENT");
  });
});
