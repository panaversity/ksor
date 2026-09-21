/**
 * The catalog, and the filter rules every entry point shares.
 *
 * The fixtures cover the six shapes the spec names — text-only chat, a
 * chat model that takes images, an embedding model, an image generator, a
 * video model, a reranker — because a filter that is only ever exercised
 * against the shape it was written for is a filter nobody has tested.
 */

import { describe, expect, it } from "vitest";

import {
  VERIFIED_SEED,
  discoverCatalog,
  parseModel,
  selectModels,
  stillCompatible,
  type CatalogModel,
} from "./catalog.js";
import type { OrcaCredential } from "./credential.js";

const resolver = async (): Promise<OrcaCredential> => ({
  apiKey: "sk-orca-fixture-0001",
  source: "api_key",
  userId: null,
  scope: "unknown",
  generation: 0,
});

/** One live record, in the shape the endpoint actually returns. */
function live(record: Record<string, unknown>): CatalogModel {
  const parsed = parseModel(record, "live");
  if (parsed === null) throw new Error(`fixture did not parse: ${JSON.stringify(record)}`);
  return parsed;
}

const TEXT_ONLY = live({
  id: "vendor/text-only",
  name: "Vendor: Text Only",
  context_length: 200_000,
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  supported_endpoint_types: ["openai", "anthropic"],
});

const VISION_CHAT = live({
  id: "vendor/vision-chat",
  name: "Vendor: Vision Chat",
  context_length: 1_000_000,
  architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  supported_endpoint_types: ["openai"],
});

const AUDIO_CHAT = live({
  id: "vendor/audio-chat",
  context_length: 128_000,
  architecture: { input_modalities: ["text", "audio"], output_modalities: ["text"] },
  supported_endpoint_types: ["openai"],
});

const UNDECLARED_CHAT = live({
  id: "vendor/undeclared",
  architecture: { output_modalities: ["text"] },
  supported_endpoint_types: ["openai"],
});

const EMBEDDING = live({
  id: "vendor/embed-1",
  architecture: { input_modalities: ["text"], output_modalities: ["embedding"] },
  supported_endpoint_types: ["embeddings"],
});

const IMAGE_GEN = live({
  id: "vendor/draw-1",
  architecture: { input_modalities: ["text"], output_modalities: ["image"] },
  supported_endpoint_types: ["image-generation"],
});

const VIDEO_GEN = live({
  id: "vendor/movie-1",
  architecture: { input_modalities: ["text", "image"], output_modalities: ["video"] },
  supported_endpoint_types: ["openai-video"],
});

const RERANK = live({
  id: "vendor/rank-1",
  architecture: { input_modalities: ["text"], output_modalities: ["score"] },
  supported_endpoint_types: ["jina-rerank"],
});

const ALL = [
  TEXT_ONLY,
  VISION_CHAT,
  AUDIO_CHAT,
  UNDECLARED_CHAT,
  EMBEDDING,
  IMAGE_GEN,
  VIDEO_GEN,
  RERANK,
];

const ids = (models: readonly CatalogModel[]): string[] => models.map((m) => m.id).sort();

describe("parsing a catalog record", () => {
  it("keeps the vendor/model namespace verbatim, case and all", () => {
    // The id is what a request carries; rewriting it — lowercasing it,
    // stripping the namespace — addresses a model that does not exist.
    const model = parseModel(
      { id: "DeepSeek/DeepSeek-V4.1-Flash", supported_endpoint_types: ["openai"] },
      "live",
    );
    expect(model?.id).toBe("DeepSeek/DeepSeek-V4.1-Flash");
    expect(model?.name).toBe("DeepSeek/DeepSeek-V4.1-Flash"); // no name sent → the id stands in
    const seed = VERIFIED_SEED[0];
    expect(seed?.id).toContain("/");
  });

  it("drops a record with no id rather than inventing one", () => {
    expect(parseModel({}, "live")).toBeNull();
    expect(parseModel({ id: "" }, "live")).toBeNull();
    expect(parseModel(null, "live")).toBeNull();
    expect(parseModel("a string", "live")).toBeNull();
  });

  it("drops a live record that advertises no endpoint type we could call", () => {
    // The bounds clause: a catalog must not be able to advertise routes the
    // client cannot speak.
    expect(parseModel({ id: "vendor/mystery" }, "live")).toBeNull();
  });

  it("leaves reasoning effort ABSENT when the source does not state it", () => {
    // Live discovery does not advertise an effort ladder. Guessing one from a
    // model name is exactly what the spec forbids, so it stays empty.
    expect(TEXT_ONLY.reasoningEfforts).toEqual([]);
  });

  it("reads context and max output from either the top level or top_provider", () => {
    const nested = parseModel(
      { id: "v/m", supported_endpoint_types: ["openai"], top_provider: { context_length: 4096 } },
      "live",
    );
    expect(nested?.contextLength).toBe(4096);
  });
});

describe("capability filtering", () => {
  it("chat takes text endpoints and excludes every non-text route", () => {
    expect(ids(selectModels(ALL, { capability: "chat" }))).toEqual([
      "vendor/audio-chat",
      "vendor/text-only",
      "vendor/undeclared",
      "vendor/vision-chat",
    ]);
  });

  it("embedding matches the embeddings endpoint only", () => {
    expect(ids(selectModels(ALL, { capability: "embedding" }))).toEqual(["vendor/embed-1"]);
  });

  it("image matches image-generation only", () => {
    expect(ids(selectModels(ALL, { capability: "image" }))).toEqual(["vendor/draw-1"]);
  });

  it("video matches openai-video only", () => {
    expect(ids(selectModels(ALL, { capability: "video" }))).toEqual(["vendor/movie-1"]);
  });

  it("rerank matches jina-rerank only", () => {
    expect(ids(selectModels(ALL, { capability: "rerank" }))).toEqual(["vendor/rank-1"]);
  });
});

describe("multimodal fails CLOSED", () => {
  it("an image attachment narrows chat to models that DECLARE image input", () => {
    const options = selectModels(ALL, { capability: "chat", inputModality: "image" });
    expect(ids(options)).toEqual(["vendor/vision-chat"]);
    // The two that must NOT appear: one that says nothing about modalities,
    // and one that declares text only. "Undeclared" is not "supported".
    expect(ids(options)).not.toContain("vendor/undeclared");
    expect(ids(options)).not.toContain("vendor/text-only");
  });

  it("an audio attachment narrows to declared audio input", () => {
    expect(ids(selectModels(ALL, { capability: "chat", inputModality: "audio" }))).toEqual([
      "vendor/audio-chat",
    ]);
  });

  it("a modality nothing declares yields an EMPTY list, not the unfiltered one", () => {
    // The failure this guards: falling back to "show everything" when nothing
    // matches, which is how an incompatible model reaches a request.
    expect(selectModels(ALL, { capability: "chat", inputModality: "video" })).toEqual([]);
  });

  it("is not satisfied by a non-text model that happens to declare the modality", () => {
    // VIDEO_GEN declares image input, but it is not a chat model — the
    // capability filter still has to hold.
    const options = selectModels(ALL, { capability: "chat", inputModality: "image" });
    expect(ids(options)).not.toContain("vendor/movie-1");
  });
});

describe("a stale selection is detectable", () => {
  it("says so when the model is still compatible, and when it is not", () => {
    expect(stillCompatible("vendor/text-only", ALL, { capability: "chat" })).toBe(true);
    // Adding an attachment invalidates a text-only selection.
    expect(
      stillCompatible("vendor/text-only", ALL, { capability: "chat", inputModality: "image" }),
    ).toBe(false);
    // Changing the capability invalidates it too.
    expect(stillCompatible("vendor/text-only", ALL, { capability: "embedding" })).toBe(false);
    // A model that is not in the catalog at all is not compatible by default.
    expect(stillCompatible("vendor/gone", ALL, { capability: "chat" })).toBe(false);
  });
});

describe("discovery", () => {
  const withFetch = (impl: typeof fetch) => ({
    apiBase: "https://api.orcarouter.ai/v1",
    resolver,
    fetchImpl: impl,
  });

  it("treats a live answer as authoritative, with no seed mixed in", async () => {
    const catalog = await discoverCatalog(
      withFetch(
        async () =>
          new Response(
            JSON.stringify({
              data: [{ id: "vendor/only-live", supported_endpoint_types: ["openai"] }],
            }),
            { status: 200 },
          ),
      ),
    );
    expect(catalog.source).toBe("live");
    expect(catalog.degraded).toBe(false);
    expect(catalog.reason).toBeNull();
    expect(catalog.models.map((m) => m.id)).toEqual(["vendor/only-live"]);
    // NOT one seed entry may ride along — a merged result is one nobody can
    // tell the truth about.
    for (const seed of VERIFIED_SEED) {
      expect(catalog.models.map((m) => m.id)).not.toContain(seed.id);
    }
  });

  it("falls back to the verified seed and SAYS SO when the endpoint fails", async () => {
    for (const impl of [
      (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
      (async () => new Response("{ not json", { status: 200 })) as unknown as typeof fetch,
      (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    ]) {
      const catalog = await discoverCatalog(withFetch(impl));
      expect(catalog.source).toBe("seed");
      expect(catalog.degraded).toBe(true);
      expect(catalog.reason).not.toBeNull();
      expect(catalog.models.length).toBe(VERIFIED_SEED.length);
    }
  });

  it("keeps the verified seed's reasoning ladder and modality metadata intact", async () => {
    const catalog = await discoverCatalog(
      withFetch(async () => {
        throw new TypeError("offline");
      }),
    );
    const gpt = catalog.models.find((m) => m.id === "openai/gpt-5.5");
    // The regression the spec names: restoring model NAMES while dropping
    // reasoning effort and input modality is easy to miss if a test asserts
    // IDs only.
    expect(gpt?.reasoningEfforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(gpt?.inputModalities).toContain("image");
    expect(gpt?.contextLength).toBeGreaterThan(0);
    for (const model of catalog.models) {
      expect(model.source).toBe("seed");
      expect(model.id).toContain("/");
      expect(model.contextLength === null || model.contextLength > 0).toBe(true);
    }
  });

  it("bounds the response size", async () => {
    const big = "x".repeat(4096);
    const catalog = await discoverCatalog({
      ...withFetch(
        async () => new Response(JSON.stringify({ data: [{ id: big }] }), { status: 200 }),
      ),
      maxBytes: 64,
    });
    expect(catalog.degraded).toBe(true);
    expect(catalog.reason).toMatch(/bytes/);
  });

  it("bounds the item count", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `vendor/m${i}`,
      supported_endpoint_types: ["openai"],
    }));
    const catalog = await discoverCatalog({
      ...withFetch(async () => new Response(JSON.stringify({ data: many }), { status: 200 })),
      maxItems: 3,
    });
    expect(catalog.models.length).toBe(3);
    // Truncation is REPORTED through `received`, so a caller can say what it
    // dropped instead of presenting a partial list as the whole one.
    expect(catalog.received).toBe(50);
  });

  it("sends the key as a header and never in the URL", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    await discoverCatalog(
      withFetch(async (input, init) => {
        const headers = new Headers(init?.headers);
        seen.push({ url: String(input), auth: headers.get("authorization") });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );
    expect(seen.length).toBe(1);
    expect(seen[0]?.url).toBe("https://api.orcarouter.ai/v1/models");
    expect(seen[0]?.url).not.toContain("sk-orca");
    expect(seen[0]?.auth).toBe("Bearer sk-orca-fixture-0001");
  });
});
