/**
 * The Gemini transport without the vendor SDK.
 *
 * `@google/genai` is 17 MB installed (twice, under pnpm) for two HTTP calls
 * this module already wraps behind a structurally-typed client slice. These
 * tests hold the wire contract that slice depends on — verified against the
 * live API on 2026-08-22 before a line was written, including the check that
 * decides whether a swap is even safe: SDK and REST return **byte-identical**
 * vectors for the same text, so no stored embedding and no calibrated floor
 * moves (issue #54).
 *
 * The network is injected, never mocked globally: these assert the REQUEST we
 * build and the RESPONSE we parse. `gemini.live.db.test.ts` remains the one
 * call to the real vendor and the tripwire for drift.
 */

import { describe, expect, it } from "vitest";

import { geminiRestEmbedClient, geminiRestTextClient } from "./gemini-rest.js";

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("the embed transport", () => {
  it("posts batchEmbedContents with one request per text", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = geminiRestEmbedClient("k-123", {
      fetchImpl: async (url, init) => {
        seen = { url: String(url), init: init ?? {} };
        return ok({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] });
      },
    });
    const out = await client.models.embedContent({
      model: "gemini-embedding-001",
      contents: ["alpha", "beta"],
      config: {
        outputDimensionality: 1536,
        taskType: "RETRIEVAL_DOCUMENT",
        httpOptions: { timeout: 9000 },
      },
    });

    expect(seen!.url).toContain("/models/gemini-embedding-001:batchEmbedContents");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k-123");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toEqual({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: "alpha" }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 1536,
    });
    expect(out.embeddings?.map((e) => e.values)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("keeps the API key out of the URL — a key in a query string lands in logs", async () => {
    let url = "";
    const client = geminiRestEmbedClient("secret-key", {
      fetchImpl: async (u) => {
        url = String(u);
        return ok({ embeddings: [] });
      },
    });
    await client.models.embedContent({
      model: "m",
      contents: ["x"],
      config: { outputDimensionality: 8, taskType: "T", httpOptions: { timeout: 1000 } },
    });
    expect(url).not.toContain("secret-key");
  });

  it("throws an Error carrying a NUMERIC status — what the retry classifier reads", async () => {
    const client = geminiRestEmbedClient("k", {
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { code: 429, message: "quota" } }), { status: 429 }),
    });
    const boom = client.models.embedContent({
      model: "m",
      contents: ["x"],
      config: { outputDimensionality: 8, taskType: "T", httpOptions: { timeout: 1000 } },
    });
    await expect(boom).rejects.toThrow(/quota|429/);
    await boom.catch((e: unknown) => {
      expect(e).toBeInstanceOf(Error);
      expect((e as { status?: unknown }).status, "the classifier duck-types on this").toBe(429);
    });
  });
});

describe("the text transport", () => {
  it("posts generateContent and joins the candidate's parts", async () => {
    let body: Record<string, unknown> = {};
    const client = geminiRestTextClient("k", {
      fetchImpl: async (_u, init) => {
        body = JSON.parse(String((init ?? {}).body));
        return ok({ candidates: [{ content: { parts: [{ text: "re" }, { text: "ady" }] } }] });
      },
    });
    const out = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "say ready",
      config: { temperature: 0, maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(body["contents"]).toEqual([{ parts: [{ text: "say ready" }] }]);
    expect(body["generationConfig"]).toEqual({
      temperature: 0,
      maxOutputTokens: 64,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(out.text).toBe("ready");
  });

  it("answers empty when the model returns no candidate, never undefined-shaped", async () => {
    const client = geminiRestTextClient("k", { fetchImpl: async () => ok({}) });
    const out = await client.models.generateContent({
      model: "m",
      contents: "x",
      config: { temperature: 0, maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(out.text ?? "").toBe("");
  });
});
