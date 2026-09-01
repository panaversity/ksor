/**
 * The OpenAI adapter, against a stubbed transport.
 *
 * The assertions worth having are the ones a passing embed would hide:
 *
 *   ORDER. The vendor returns each vector with its own `index` and does not
 *   promise array order. The framework pairs vectors to texts POSITIONALLY, so
 *   a shuffled response silently attaches every passage's text to another
 *   passage's vector — same count, same width, all finite, every downstream
 *   check green, and a record that answers with the wrong document forever.
 *
 *   RETRY PLANES. 429 is retryable on ingest and never on read. That is a
 *   property of ksor's two planes, not of a vendor, so it has to hold
 *   identically here or switching provider quietly changes serving behaviour.
 *
 *   SYMMETRY. This vendor has no task type, so intent must not reach the wire
 *   as a label — but must still pick the timeout, because that follows the
 *   plane.
 */

import { describe, expect, it } from "vitest";

import { OpenAiEmbeddingProvider, isRetryable, isRetryableQuery } from "./openai.js";
import {
  OpenAiHttpError,
  openAiRestEmbedClient,
  PERMANENT_QUOTA,
  type OpenAiEmbedClient,
} from "./openai-rest.js";

const opts = {
  modelId: "text-embedding-3-small",
  dim: 4,
  documentTaskLabel: "",
  queryTaskLabel: "",
  apiKey: "unused",
  documentTimeoutS: 30,
  queryTimeoutS: 2,
};

/** Records what the adapter asked for, and answers with what it is told. */
function stub(answer: (p: { input: readonly string[] }) => ReadonlyArray<{ values?: number[] }>) {
  const calls: Array<{ model: string; dimensions: number; timeoutMs: number; input: string[] }> =
    [];
  const client: OpenAiEmbedClient = {
    async embed(params) {
      calls.push({
        model: params.model,
        dimensions: params.dimensions,
        timeoutMs: params.timeoutMs,
        input: [...params.input],
      });
      return { embeddings: answer({ input: params.input }) };
    },
  };
  return { client, calls };
}

describe("what reaches the wire", () => {
  it("sends the declared model and dimension", async () => {
    const { client, calls } = stub(({ input }) => input.map(() => ({ values: [1, 0, 0, 0] })));
    const p = new OpenAiEmbeddingProvider({ ...opts, clientFactory: () => client });
    await p.embed(["a"], { intent: "document" });
    expect(calls[0]?.model).toBe("text-embedding-3-small");
    expect(calls[0]?.dimensions).toBe(4);
  });

  it("picks the timeout from the PLANE the intent names", async () => {
    const { client, calls } = stub(({ input }) => input.map(() => ({ values: [1, 0, 0, 0] })));
    const p = new OpenAiEmbeddingProvider({ ...opts, clientFactory: () => client });
    await p.embed(["a"], { intent: "document" });
    await p.embed(["a"], { intent: "query" });
    expect(calls[0]?.timeoutMs, "document = batch patience").toBe(30_000);
    expect(calls[1]?.timeoutMs, "query = read patience").toBe(2_000);
  });

  it("reports a recipe naming the space, not the vendor", () => {
    const p = new OpenAiEmbeddingProvider(opts);
    // The persisted identity of an embedding space is model + width. The
    // provider name is a registry key and is never compared.
    expect(p.recipe).toBe("text-embedding-3-small/d4/");
  });
});

describe("the response is paired to the request by INDEX, not by arrival order", () => {
  it("reorders a shuffled response", async () => {
    // The failure this prevents: same count, same width, all finite — every
    // downstream check passes and every passage carries another's vector.
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 2, embedding: [0, 0, 1, 0] },
            { index: 0, embedding: [1, 0, 0, 0] },
            { index: 1, embedding: [0, 1, 0, 0] },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const client = openAiRestEmbedClient("k", { fetchImpl });
    const { embeddings } = await client.embed({
      model: "m",
      input: ["first", "second", "third"],
      dimensions: 4,
      timeoutMs: 1000,
    });
    expect(embeddings.map((e) => e.values)).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ]);
  });
});

describe("errors carry the status the retry classifier reads", () => {
  it("surfaces the vendor's own message", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
        status: 429,
      })) as unknown as typeof fetch;
    const client = openAiRestEmbedClient("k", { fetchImpl });
    await expect(
      client.embed({ model: "m", input: ["a"], dimensions: 4, timeoutMs: 1000 }),
    ).rejects.toThrow(/OpenAI API error 429: Rate limit reached/);
  });

  it("falls back to the raw body when the error is not JSON", async () => {
    const fetchImpl = (async () =>
      new Response("upstream exploded", { status: 502 })) as unknown as typeof fetch;
    const client = openAiRestEmbedClient("k", { fetchImpl });
    await expect(
      client.embed({ model: "m", input: ["a"], dimensions: 4, timeoutMs: 1000 }),
    ).rejects.toThrow(/OpenAI API error 502: upstream exploded/);
  });
});

describe("the two retry planes, which are ksor's and not a vendor's", () => {
  it("ingest retries 5xx AND 429 — batch work has nobody waiting", () => {
    expect(isRetryable(new OpenAiHttpError(429, "rate limited"))).toBe(true);
    expect(isRetryable(new OpenAiHttpError(503, "unavailable"))).toBe(true);
  });

  it("read retries 5xx and NEVER 429 — a search degrades instead of stalling", () => {
    expect(isRetryableQuery(new OpenAiHttpError(503, "unavailable"))).toBe(true);
    expect(
      isRetryableQuery(new OpenAiHttpError(429, "rate limited")),
      "a rate-limited project is still rate-limited a second later",
    ).toBe(false);
  });

  it("neither retries a 4xx that will never succeed", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryable(new OpenAiHttpError(status, "no")), `ingest ${status}`).toBe(false);
      expect(isRetryableQuery(new OpenAiHttpError(status, "no")), `read ${status}`).toBe(false);
    }
  });

  it("never retries a SPENT BALANCE, which arrives as 429 like a rate limit", () => {
    // Observed live against a real key: OpenAI answers an exhausted balance
    // with 429 and `type: insufficient_quota`. Reading only the status costs
    // five exponential backoffs and then reports a billing problem as though
    // it had been transient.
    const broke = new OpenAiHttpError(429, "You have no credits remaining.", PERMANENT_QUOTA);
    expect(isRetryable(broke), "no amount of patience adds credit").toBe(false);
    expect(isRetryableQuery(broke)).toBe(false);

    // …and an ordinary rate limit is still patient on the ingest plane.
    expect(isRetryable(new OpenAiHttpError(429, "Rate limit reached", "rate_limit_error"))).toBe(
      true,
    );
  });

  it("carries the vendor's error type off the wire", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: { message: "You have no credits remaining.", type: "insufficient_quota" },
        }),
        { status: 429 },
      )) as unknown as typeof fetch;
    const client = openAiRestEmbedClient("k", { fetchImpl });
    await client
      .embed({ model: "m", input: ["a"], dimensions: 4, timeoutMs: 1000 })
      .then(() => expect.unreachable("should have thrown"))
      .catch((exc: unknown) => {
        expect(exc).toBeInstanceOf(OpenAiHttpError);
        expect((exc as OpenAiHttpError).kind).toBe(PERMANENT_QUOTA);
        expect(isRetryable(exc)).toBe(false);
      });
  });

  it("treats a transport blip as retryable on both planes", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(isRetryable(abort)).toBe(true);
    expect(isRetryableQuery(abort)).toBe(true);
  });
});

describe("reset", () => {
  it("drops the client so the next call rebuilds, and is idempotent", async () => {
    let built = 0;
    const { client } = stub(({ input }) => input.map(() => ({ values: [1, 0, 0, 0] })));
    const p = new OpenAiEmbeddingProvider({
      ...opts,
      clientFactory: () => {
        built += 1;
        return client;
      },
    });
    await p.embed(["a"], { intent: "document" });
    expect(built).toBe(1);
    p.reset();
    p.reset();
    await p.embed(["a"], { intent: "document" });
    expect(built).toBe(2);
  });
});
