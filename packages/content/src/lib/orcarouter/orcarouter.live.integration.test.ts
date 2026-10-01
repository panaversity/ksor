/**
 * The live OrcaRouter call — the drift tripwire.
 *
 * Everything else in this directory runs against a fake server or an injected
 * `fetch`, on purpose: a suite that needs a vendor account is a suite that is
 * red when the vendor is. This one is the exception, and for the same reason
 * the OpenAI and Gemini live suites exist — a wire format can change under a
 * client whose fixtures all agree with it, and the only thing that notices is a
 * real request.
 *
 * GATED on ORCAROUTER_API_KEY, so a checkout without one SKIPS with a notice
 * rather than failing. What it asserts is deliberately narrow: that the
 * implemented provider path reaches the real relay, is accepted, and that model
 * discovery returns records this client can actually speak. It does not assert
 * WHICH models an account has — that is the account's business, and a test
 * pinned to a model list would go red on somebody else's catalog change.
 */

import { describe, expect, it } from "vitest";

import { discoverCatalog, selectModels } from "./catalog.js";
import { resolveEndpoints } from "./endpoints.js";
import { operatorResolver } from "./store.js";
import { ApiKeyCredentialSource } from "./credential.js";
import { OrcaRouterTextGenerator, type OrcaCredentialResolver } from "./transport.js";

const apiKey = process.env["ORCAROUTER_API_KEY"] ?? "";
const resolver: OrcaCredentialResolver = async () => {
  const fromEnv = process.env["ORCAROUTER_API_KEY"];
  // A real environment variable wins over the file, exactly as everywhere else.
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return await new ApiKeyCredentialSource(fromEnv.trim()).acquire();
  }
  return await operatorResolver()();
};

describe.runIf(apiKey !== "")("orcarouter — live", () => {
  const { apiBase, authBase } = resolveEndpoints();

  it("is pointed at the relay for inference and the auth origin for login", () => {
    // Asserted here too, because the live suite is the one that would carry a
    // wrong origin all the way to a real request.
    expect(apiBase).toBe("https://api.orcarouter.ai/v1");
    expect(authBase).toBe("https://www.orcarouter.ai");
    expect(apiBase).not.toContain("www.");
  });

  it("discovers the account's catalog, and it is not the seed", async () => {
    const catalog = await discoverCatalog({ apiBase, resolver });
    expect(catalog.degraded, `catalog did not answer: ${catalog.reason ?? ""}`).toBe(false);
    expect(catalog.source).toBe("live");
    expect(catalog.models.length).toBeGreaterThan(0);
    // Every id keeps its vendor/model namespace — the relay publishes ids this
    // client passes through verbatim, and a rewritten one addresses nothing.
    for (const model of catalog.models) {
      expect(model.id).toContain("/");
      expect(model.endpointTypes.length).toBeGreaterThan(0);
    }
    // A seed entry riding along inside a live catalog is the merge this whole
    // module refuses; assert the two are disjoint by source.
    for (const model of catalog.models) expect(model.source).toBe("live");
  });

  it("filters the live catalog to what a text selector may offer", async () => {
    const catalog = await discoverCatalog({ apiBase, resolver });
    const chat = selectModels(catalog.models, { capability: "chat" });
    expect(chat.length).toBeGreaterThan(0);
    // No dedicated non-text route may appear in a text selector.
    for (const model of chat) {
      expect(model.endpointTypes).not.toContain("image-generation");
      expect(model.endpointTypes).not.toContain("openai-video");
      expect(model.endpointTypes).not.toContain("jina-rerank");
    }
    // An attachment narrows to models that DECLARE image input, and never
    // widens: the multimodal list is a subset of the text list.
    const vision = selectModels(catalog.models, { capability: "chat", inputModality: "image" });
    expect(vision.length).toBeLessThanOrEqual(chat.length);
    for (const model of vision) expect(model.inputModalities).toContain("image");
  });

  it("generates text through the implemented provider path", async () => {
    const catalog = await discoverCatalog({ apiBase, resolver });
    const chat = selectModels(catalog.models, { capability: "chat" });
    expect(chat.length, "no chat-capable model on this credential").toBeGreaterThan(0);

    // THE CATALOG IS NOT THE GRANT. `/v1/models` lists what the ACCOUNT can
    // see; a key can be scoped narrower than that, and the relay answers 403
    // `block_key_scope` for a model the catalog happily advertised (observed
    // live, 2026-09-15). So this walks the options rather than pinning the
    // first one: what is under test is that the implemented path can complete a
    // real generation on THIS credential, not that any particular model is
    // reachable from it.
    const failures: string[] = [];
    let answered: string | null = null;
    for (const model of chat) {
      const generator = new OrcaRouterTextGenerator({ resolver, apiBase, model: model.id });
      try {
        const answer = await generator.generate("Reply with exactly the two characters: ok", {
          maxOutputTokens: 16,
        });
        if (answer.trim().length > 0) {
          answered = model.id;
          break;
        }
        failures.push(`${model.id}: empty answer`);
      } catch (exc) {
        failures.push(`${model.id}: ${exc instanceof Error ? exc.name : String(exc)}`);
      }
    }
    expect(
      answered,
      `no chat model on this credential answered — ${failures.join("; ")}`,
    ).not.toBeNull();
  }, 120_000);

  it("answers a revoked or unauthorized model with a NAMED failure, not a hang", async () => {
    // The relay refuses a model the key has no access to. That is an
    // OrcaHttpError with a status — a classifiable outcome, not a timeout —
    // which is what the retry classifiers read.
    const generator = new OrcaRouterTextGenerator({
      resolver,
      apiBase,
      model: "vendor/definitely-not-a-real-model-for-this-key",
      timeoutMs: 30_000,
    });
    const failure = await generator.generate("hi").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    // A status, not a timeout and not an unhandled rejection: this is the value
    // the retry classifiers branch on, and it is what makes the failure a
    // NAMED outcome rather than a hang.
    expect((failure as { status?: number }).status).toBe(403);
  }, 60_000);
});

describe.runIf(apiKey === "")("orcarouter — live (gated)", () => {
  it("skips without ORCAROUTER_API_KEY, and says so", () => {
    // The suite announces its own skip: a green run that never touched the
    // vendor must not read as evidence that the vendor accepted anything.
    expect(apiKey).toBe("");
  });
});
