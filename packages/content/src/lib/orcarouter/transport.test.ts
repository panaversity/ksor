/**
 * The transport's origin discipline, its `401` classification, and the
 * generation-safe recovery that classification feeds.
 *
 * The origin assertion is the one worth reading twice: a request built here
 * must go to the RELAY base, and the auth origin must never appear in it. The
 * mirror-image mistake — sending inference to `www.orcarouter.ai` — is as
 * broken as sending the exchange to `api.orcarouter.ai/v1/auth/keys`, and only
 * one of the two is usually tested.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEXT_MODEL,
  OrcaHttpError,
  OrcaRouterEmbeddingProvider,
  OrcaRouterTextGenerator,
  OrcaUnauthorizedError,
  describeCredential,
  isFatal,
  isRetryable,
  isRetryableQuery,
} from "./transport.js";
import type { OrcaCredential } from "./credential.js";
import {
  INITIAL_STATE,
  installCredential,
  markNeedsReauth,
  refOf,
  reauthMessage,
  usable,
} from "./reauth.js";

const API_BASE = "https://api.orcarouter.ai/v1";

function credential(over: Partial<OrcaCredential> = {}): OrcaCredential {
  return {
    apiKey: "sk-orca-transport-fixture-0001",
    source: "pkce",
    userId: "12345",
    scope: "api",
    generation: 1,
    ...over,
  };
}

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly auth: string | null;
  readonly body: unknown;
}

function recorder(response: Response): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    return response;
  }) as unknown as typeof fetch;
  return { fetch: impl, seen };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function embedder(fetchImpl: typeof fetch, onUnauthorized?: (c: OrcaCredential) => void) {
  return new OrcaRouterEmbeddingProvider({
    resolver: async () => credential(),
    apiBase: API_BASE,
    modelId: "vendor/embed-1",
    dim: 1536,
    // SYMMETRIC: no task type, so both labels are empty.
    documentTaskLabel: "",
    queryTaskLabel: "",
    documentTimeoutS: 30,
    queryTimeoutS: 10,
    fetchImpl,
    ...(onUnauthorized === undefined ? {} : { onUnauthorized }),
  });
}

describe("the relay origin, and only the relay origin", () => {
  it("embeds against api.orcarouter.ai/v1, with the key in a header", async () => {
    const { fetch: fetchImpl, seen } = recorder(
      json({ data: [{ embedding: [0.1, 0.2], index: 0 }] }),
    );
    const provider = embedder(fetchImpl);
    const vectors = await provider.embed(["hello"], { intent: "document" });

    expect(vectors).toEqual([[0.1, 0.2]]);
    expect(seen[0]?.url).toBe(`${API_BASE}/embeddings`);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.auth).toBe("Bearer sk-orca-transport-fixture-0001");
    // The mirror-image mistake: inference must never go to the auth origin.
    expect(seen[0]?.url).not.toContain("www.orcarouter.ai");
    // And the key is never in the URL, which every proxy logs.
    expect(seen[0]?.url).not.toContain("sk-orca");
  });

  it("generates text against the relay's chat completions", async () => {
    const { fetch: fetchImpl, seen } = recorder(
      json({ choices: [{ message: { content: "a probe question?" } }] }),
    );
    const generator = new OrcaRouterTextGenerator({
      resolver: async () => credential(),
      apiBase: API_BASE,
      fetchImpl,
    });
    const text = await generator.generate("write a question");

    expect(text).toBe("a probe question?");
    expect(seen[0]?.url).toBe(`${API_BASE}/chat/completions`);
    expect(seen[0]?.url).not.toContain("www.orcarouter.ai");
    // Temperature 0: a sampled probe question makes two measurements of one
    // corpus incomparable.
    expect((seen[0]?.body as { temperature: number }).temperature).toBe(0);
    expect((seen[0]?.body as { model: string }).model).toBe(DEFAULT_TEXT_MODEL);
  });

  it("keeps the vendor/model namespace verbatim in the request body", async () => {
    const { fetch: fetchImpl, seen } = recorder(json({ data: [] }));
    const provider = new OrcaRouterEmbeddingProvider({
      resolver: async () => credential(),
      apiBase: API_BASE,
      modelId: "DeepSeek/DeepSeek-V4.1-Flash",
      dim: 1536,
      documentTaskLabel: "",
      queryTaskLabel: "",
      documentTimeoutS: 30,
      queryTimeoutS: 10,
      fetchImpl,
    });
    await provider.embed(["x"], { intent: "document" });
    expect((seen[0]?.body as { model: string }).model).toBe("DeepSeek/DeepSeek-V4.1-Flash");
  });

  it("orders vectors by the index each item carries, not by field order", async () => {
    // A shuffled embedding is silently wrong and no width or degeneracy check
    // would catch it.
    const { fetch: fetchImpl } = recorder(
      json({
        data: [
          { embedding: [2], index: 1 },
          { embedding: [1], index: 0 },
        ],
      }),
    );
    expect(await embedder(fetchImpl).embed(["a", "b"], { intent: "document" })).toEqual([[1], [2]]);
  });

  it("resolves the credential PER CALL, so a re-login is picked up", async () => {
    let generation = 1;
    const seen: string[] = [];
    const provider = new OrcaRouterEmbeddingProvider({
      resolver: async () => credential({ generation, apiKey: `sk-orca-gen-${generation}` }),
      apiBase: API_BASE,
      modelId: "vendor/embed-1",
      dim: 1536,
      documentTaskLabel: "",
      queryTaskLabel: "",
      documentTimeoutS: 30,
      queryTimeoutS: 10,
      fetchImpl: (async (_input: string | URL, init?: RequestInit) => {
        seen.push(new Headers(init?.headers).get("authorization") ?? "");
        return json({ data: [] });
      }) as unknown as typeof fetch,
    });
    await provider.embed(["a"], { intent: "document" });
    generation = 2;
    await provider.embed(["b"], { intent: "document" });
    expect(seen).toEqual(["Bearer sk-orca-gen-1", "Bearer sk-orca-gen-2"]);
  });
});

describe("401 is terminal, not a retry", () => {
  it("raises a typed error naming the account and generation that made the request", async () => {
    const { fetch: fetchImpl } = recorder(
      json({ error: { message: "invalid key", type: "orcarouter_api_error" } }, 401),
    );
    const failure = await embedder(fetchImpl)
      .embed(["a"], { intent: "document" })
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OrcaUnauthorizedError);
    expect((failure as OrcaUnauthorizedError).userId).toBe("12345");
    expect((failure as OrcaUnauthorizedError).generation).toBe(1);
  });

  it("calls the onUnauthorized hook with the exact rejected credential", async () => {
    const { fetch: fetchImpl } = recorder(json({ error: { message: "revoked" } }, 401));
    const rejected: OrcaCredential[] = [];
    await embedder(fetchImpl, (c) => rejected.push(c))
      .embed(["a"], { intent: "document" })
      .catch(() => {});
    expect(rejected.length).toBe(1);
    expect(refOf(rejected[0]!)).toEqual({ userId: "12345", generation: 1 });
  });

  it("is not retryable on EITHER plane — no fake refresh, no loop", async () => {
    const { fetch: fetchImpl } = recorder(json({ error: { message: "revoked" } }, 401));
    const provider = embedder(fetchImpl);
    const failure = await provider.embed(["a"], { intent: "document" }).catch((e: unknown) => e);
    // The ingest plane: retrying a rejected durable key is the "loop forever on
    // 401" failure the spec names.
    expect(isRetryable(failure)).toBe(false);
    // The read plane: same.
    expect(isRetryableQuery(failure)).toBe(false);
    // And it is an ACCOUNT failure, so the drain aborts instead of
    // quarantining chunks for a reason that has nothing to do with them.
    expect(isFatal(failure)).toBe(true);
    expect(provider.isFatal?.(failure)).toBe(true);
  });

  it("still retries the things that ARE transient", async () => {
    const server = new OrcaHttpError(503, { message: "unavailable", type: null, code: null });
    expect(isRetryable(server)).toBe(true);
    expect(isRetryableQuery(server)).toBe(true);
    const limited = new OrcaHttpError(429, { message: "slow down", type: null, code: null });
    expect(isRetryable(limited)).toBe(true); // batch work has nobody waiting
    expect(isRetryableQuery(limited)).toBe(false); // a reader degrades instead of stalling
    // A spent balance arrives as 429 and never clears by waiting.
    const broke = new OrcaHttpError(429, {
      message: "no credit",
      type: "insufficient_quota",
      code: null,
    });
    expect(isRetryable(broke)).toBe(false);
    expect(isFatal(broke)).toBe(true);
  });

  it("does not put the key in the error it raises", async () => {
    const { fetch: fetchImpl } = recorder(
      json({ error: { message: `bad key ${credential().apiKey}` } }, 401),
    );
    const failure = await embedder(fetchImpl)
      .embed(["a"], { intent: "document" })
      .catch((e: unknown) => e);
    // The vendor echoed it; the client must not add it to anything it prints.
    // (The body is external text and is passed through only as the vendor sent
    // it — what this asserts is that OUR message adds nothing.)
    expect((failure as Error).message).not.toContain("sk-orca-transport-fixture");
    expect(describeCredential(credential())).not.toContain("transport-fixture");
  });
});

describe("the terminal state, made generation-safe", () => {
  it("marks the account that made the rejected request", () => {
    const state = { userId: "12345", generation: 3, status: "ok" as const, reason: null };
    const next = markNeedsReauth(state, { userId: "12345", generation: 3 }, "401 from the relay");
    expect(next.status).toBe("needsReauth");
    expect(usable(next)).toBe(false);
    expect(reauthMessage(next)).toContain("ksor connect orcarouter");
    // The sentence must not promise a refresh that does not exist.
    expect(reauthMessage(next)).toMatch(/nothing to refresh/);
  });

  it("REFUSES to mark a credential from a previous generation", () => {
    // The race this exists for: a request issued under generation 3 fails
    // after the user has already reauthorized as generation 4. Marking the
    // account now would tell a user who just signed in that they are signed
    // out.
    const state = { userId: "12345", generation: 4, status: "ok" as const, reason: null };
    const next = markNeedsReauth(state, { userId: "12345", generation: 3 }, "late 401");
    expect(next).toBe(state); // identity: no write, no state change
    expect(next.status).toBe("ok");
  });

  it("refuses a different account's failure too", () => {
    const state = { userId: "12345", generation: 2, status: "ok" as const, reason: null };
    const next = markNeedsReauth(state, { userId: "99999", generation: 2 }, "another account");
    expect(next).toBe(state);
  });

  it("a successful re-login bumps the generation and clears the terminal state", () => {
    const dead = {
      userId: "12345",
      generation: 3,
      status: "needsReauth" as const,
      reason: "revoked",
    };
    const fresh = installCredential(dead, credential({ generation: 0 }));
    expect(fresh.generation).toBe(4);
    expect(fresh.status).toBe("ok");
    expect(fresh.reason).toBeNull();
    // The bump is what makes every in-flight request from before stale.
    expect(markNeedsReauth(fresh, { userId: "12345", generation: 3 }, "late")).toBe(fresh);
  });

  it("starts usable", () => {
    expect(usable(INITIAL_STATE)).toBe(true);
  });
});
