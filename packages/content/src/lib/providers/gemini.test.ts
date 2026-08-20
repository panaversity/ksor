/** Shape-level tests only: a fake genai client object stands in for the SDK —
 * the network is never touched, and the SDK classes are only instantiated to
 * pin the duck-typed predicate against the real error shape. */

import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
  GeminiEmbeddingProvider,
  GeminiTextGenerator,
  isRetryable,
  isRetryableQuery,
} from "./gemini.js";
import type { GeminiEmbedClient, GeminiTextClient } from "./gemini.js";

interface EmbedCall {
  model: string;
  contents: string[];
  config: { outputDimensionality: number; taskType: string; httpOptions: { timeout: number } };
}

/** The client slice the adapter touches, recording every call. `close()`
 * exists only so the tests can prove the adapter never calls it. */
function fakeEmbedClient(opts?: { dim?: number }): {
  client: GeminiEmbedClient & { close(): void };
  calls: EmbedCall[];
  closed: () => number;
  failNext: (exc: Error) => void;
} {
  const calls: EmbedCall[] = [];
  const dim = opts?.dim ?? 8;
  let closed = 0;
  let fail: Error | null = null;
  const client = {
    models: {
      embedContent(params: EmbedCall): Promise<{ embeddings?: Array<{ values?: number[] }> }> {
        calls.push(params);
        if (fail !== null) {
          const exc = fail;
          fail = null; // one-shot: the NEXT call fails, then it heals
          return Promise.reject(exc);
        }
        return Promise.resolve({
          embeddings: params.contents.map(() => ({
            values: Array.from({ length: dim }, () => 0.1),
          })),
        });
      },
    },
    close(): void {
      closed += 1;
    },
  };
  return { client, calls, closed: () => closed, failNext: (exc) => (fail = exc) };
}

function makeProvider(client: GeminiEmbedClient): GeminiEmbeddingProvider {
  return new GeminiEmbeddingProvider({
    modelId: "gemini-embedding-001",
    dim: 1536,
    documentTaskLabel: "RETRIEVAL_DOCUMENT",
    queryTaskLabel: "RETRIEVAL_QUERY",
    apiKey: "unused",
    documentTimeoutS: 60.0,
    queryTimeoutS: 10.0,
    clientFactory: () => client,
  });
}

describe("the wire shape", () => {
  it("maps intent to the task label and carries model, contents, and dim", async () => {
    const fake = fakeEmbedClient();
    const p = makeProvider(fake.client);
    await p.embed(["a", "b"], { intent: "document" });
    await p.embed(["c"], { intent: "query" });
    const [doc, qry] = fake.calls;
    expect(doc?.config.taskType, "doc call: " + JSON.stringify(doc)).toBe("RETRIEVAL_DOCUMENT");
    expect(doc?.model).toBe("gemini-embedding-001");
    expect(doc?.contents).toEqual(["a", "b"]);
    expect(qry?.config.taskType, "qry call: " + JSON.stringify(qry)).toBe("RETRIEVAL_QUERY");
    expect(qry?.contents).toEqual(["c"]);
    expect(doc?.config.outputDimensionality).toBe(1536);
    expect(qry?.config.outputDimensionality).toBe(1536);
  });

  it("carries an HTTP timeout on every call, keyed by the intent's plane (#148)", async () => {
    const fake = fakeEmbedClient();
    const p = makeProvider(fake.client);
    await p.embed(["x"], { intent: "document" });
    await p.embed(["y"], { intent: "query" });
    const [doc, qry] = fake.calls;
    expect(doc?.config.httpOptions.timeout, "doc timeout: " + doc?.config.httpOptions.timeout).toBe(
      60_000, // documentTimeoutS, the batch/ingest patience, in the adapter's ms
    );
    expect(qry?.config.httpOptions.timeout).toBe(10_000); // queryTimeoutS, the read patience
    expect(doc?.config.httpOptions.timeout).toBeGreaterThan(0);
  });

  it("returns RAW vectors — never normalized — and tolerates missing values", async () => {
    const fake = fakeEmbedClient({ dim: 4 });
    const p = makeProvider(fake.client);
    const raw = await p.embed(["a", "b", "c"], { intent: "document" });
    expect(raw, "raw: " + JSON.stringify(raw)).toEqual([
      [0.1, 0.1, 0.1, 0.1],
      [0.1, 0.1, 0.1, 0.1],
      [0.1, 0.1, 0.1, 0.1],
    ]); // the framework normalizes, not the adapter
    const empty: GeminiEmbedClient = {
      models: { embedContent: () => Promise.resolve({}) },
    };
    expect(await makeProvider(empty).embed(["x"], { intent: "document" })).toEqual([]);
    const noValues: GeminiEmbedClient = {
      models: { embedContent: () => Promise.resolve({ embeddings: [{}] }) },
    };
    expect(await makeProvider(noValues).embed(["x"], { intent: "document" })).toEqual([[]]);
  });

  it("raises on transport failure — never swallows, never returns a partial batch", async () => {
    const fake = fakeEmbedClient();
    const p = makeProvider(fake.client);
    fake.failNext(new Error("transport exploded"));
    await expect(p.embed(["x"], { intent: "document" })).rejects.toThrow("transport exploded");
  });
});

describe("client lifecycle", () => {
  it("reset() DROPS the client (rebuilt lazily) and NEVER closes it; idempotent", async () => {
    const fake = fakeEmbedClient();
    let built = 0;
    const p = new GeminiEmbeddingProvider({
      modelId: "m",
      dim: 8,
      documentTaskLabel: "D",
      queryTaskLabel: "Q",
      apiKey: "unused",
      documentTimeoutS: 1,
      queryTimeoutS: 1,
      clientFactory: () => {
        built += 1;
        return fake.client;
      },
    });
    await p.embed(["warm"], { intent: "document" });
    await p.embed(["again"], { intent: "document" });
    expect(built, "clients built: " + built).toBe(1); // lazily built once
    p.reset();
    p.reset(); // idempotent
    await p.embed(["after reset"], { intent: "document" });
    expect(built, "clients built after reset: " + built).toBe(2);
    expect(fake.closed(), "close() calls: " + fake.closed()).toBe(0); // in-flight siblings keep their reference
  });

  it("recipe is the config recipe shape", () => {
    const p = makeProvider(fakeEmbedClient().client);
    expect(p.recipe).toBe(`${p.modelId}/d${p.dim}/${p.documentTaskLabel}`);
    expect(p.recipe).toBe("gemini-embedding-001/d1536/RETRIEVAL_DOCUMENT");
  });
});

describe("the exception taxonomy (the two predicates)", () => {
  it("disagrees on a rate limit: ingest patient, read fail-fast", () => {
    const rateLimit = new ApiError({ message: "quota", status: 429 }); // the REAL SDK error shape
    expect(isRetryable(rateLimit), "ingest on 429").toBe(true);
    expect(isRetryableQuery(rateLimit), "read on 429").toBe(false);
  });

  it("agrees on server errors and transport blips (both retry)", () => {
    const server = new ApiError({ message: "overloaded", status: 503 });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const reset = Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
    const fetchFailed = new TypeError("fetch failed");
    const wrapped = new Error("request to https://x failed", {
      cause: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
    });
    for (const exc of [server, abort, reset, fetchFailed, wrapped]) {
      expect(isRetryable(exc), "ingest on " + exc.message).toBe(true);
      expect(isRetryableQuery(exc), "read on " + exc.message).toBe(true);
    }
  });

  it("agrees on poison (neither retries)", () => {
    const poison = new Error("degenerate embedding (empty / all-zero / non-finite)");
    expect(isRetryable(poison)).toBe(false);
    expect(isRetryableQuery(poison)).toBe(false);
    const clientError = new ApiError({ message: "bad request", status: 400 });
    expect(isRetryable(clientError)).toBe(false);
    expect(isRetryableQuery(clientError)).toBe(false);
    expect(isRetryable("not an error")).toBe(false);
  });
});

describe("GeminiTextGenerator (build plane)", () => {
  interface GenCall {
    model: string;
    contents: string;
    config: {
      temperature: number;
      maxOutputTokens: number;
      thinkingConfig: { thinkingBudget: number };
    };
  }

  it("generates at temperature 0 with the thinking budget off (quarried: budget goes to TEXT)", async () => {
    const calls: GenCall[] = [];
    const client: GeminiTextClient = {
      models: {
        generateContent(params: GenCall): Promise<{ text?: string }> {
          calls.push(params);
          return Promise.resolve({ text: "a synthesized query" });
        },
      },
    };
    const gen = new GeminiTextGenerator({ apiKey: "unused", clientFactory: () => client });
    const out = await gen.generate("the prompt", { maxOutputTokens: 32 });
    expect(out).toBe("a synthesized query");
    const call = calls[0];
    expect(call, "call: " + JSON.stringify(call)).toBeDefined();
    expect(call?.model).toBe("gemini-2.5-flash"); // the oracle's build-plane default
    expect(call?.contents).toBe("the prompt");
    expect(call?.config.temperature).toBe(0);
    expect(call?.config.maxOutputTokens).toBe(32);
    expect(call?.config.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("returns '' when the model returns no text, and defaults the budget to 64", async () => {
    const calls: GenCall[] = [];
    const client: GeminiTextClient = {
      models: {
        generateContent(params: GenCall): Promise<{ text?: string }> {
          calls.push(params);
          return Promise.resolve({});
        },
      },
    };
    const gen = new GeminiTextGenerator({ apiKey: "unused", clientFactory: () => client });
    expect(await gen.generate("p")).toBe("");
    expect(calls[0]?.config.maxOutputTokens).toBe(64);
  });
});
