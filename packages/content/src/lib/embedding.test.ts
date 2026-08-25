import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aembedIntent,
  embedInput,
  embedIntent,
  embedTimeoutS,
  generateText,
  queryEmbedTimeoutS,
  vlit,
} from "./embedding.js";
import type { EmbeddingProvider, TextGenerator } from "./embedding.js";

/** A scriptable provider: `plan` yields one outcome per attempt (a vector
 * batch, or an error to throw). Retry classification is injectable. */
function stubProvider(opts: {
  plan: Array<number[][] | Error>;
  retryable?: (exc: unknown) => boolean;
  retryableQuery?: (exc: unknown) => boolean;
}): {
  provider: EmbeddingProvider;
  calls: () => number;
  resets: () => number;
} {
  let calls = 0;
  let resets = 0;
  const provider: EmbeddingProvider = {
    providerId: "stub",
    modelId: "stub-model",
    dim: 2,
    documentTaskLabel: "DOC",
    queryTaskLabel: "QRY",
    recipe: "stub-model/d2/DOC",
    embed(_texts, _opts) {
      const step = opts.plan[calls];
      calls += 1;
      if (step === undefined) throw new Error(`stub plan exhausted after ${calls - 1} steps`);
      if (step instanceof Error) return Promise.reject(step);
      return Promise.resolve(step);
    },
    isRetryable: opts.retryable ?? (() => false),
    isRetryableQuery: opts.retryableQuery ?? (() => false),
    reset() {
      resets += 1;
    },
  };
  return { provider, calls: () => calls, resets: () => resets };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("embed timeout knobs are read lazily, not frozen at module scope (issue #149)", () => {
  afterEach(() => {
    delete process.env["KSOR_EMBED_TIMEOUT_S"];
    delete process.env["KSOR_QUERY_EMBED_TIMEOUT_S"];
  });

  it("embedTimeoutS() honors KSOR_EMBED_TIMEOUT_S set after import", () => {
    // Before the fix this was a module-scope `const` evaluated at import —
    // before cli.ts's main() ever calls loadDotEnv() — so setting the env
    // var here could never change the exported value. It is impossible to
    // write this assertion against the old shape without reimporting the
    // module, which is exactly the bug.
    expect(embedTimeoutS()).toBe(60); // the documented default, unset
    process.env["KSOR_EMBED_TIMEOUT_S"] = "45";
    expect(embedTimeoutS()).toBe(45);
  });

  it("queryEmbedTimeoutS() honors KSOR_QUERY_EMBED_TIMEOUT_S set after import", () => {
    expect(queryEmbedTimeoutS()).toBe(10); // the documented default, unset
    process.env["KSOR_QUERY_EMBED_TIMEOUT_S"] = "7";
    expect(queryEmbedTimeoutS()).toBe(7);
  });
});

describe("embedInput", () => {
  it("builds the eval-locked recipe verbatim (oracle test_lib_pure)", () => {
    const got = embedInput("MCP Crash Course", "part-2-tools/defining-a-tool", "The content body.");
    expect(got, "got: " + JSON.stringify(got)).toBe(
      "MCP Crash Course > part 2 tools > defining a tool\n\nThe content body.",
    );
    expect(embedInput("", "", "bare")).toBe("bare");
    expect(embedInput("Title Only", "", "body")).toBe("Title Only\n\nbody");
  });
});

describe("vlit", () => {
  it("formats the one pgvector wire literal at 8 decimal places", () => {
    expect(vlit([0.5, -0.25])).toBe("[0.50000000,-0.25000000]");
  });
});

describe("the contract layer (through the doors)", () => {
  it("L2-normalizes every vector the transport returns", async () => {
    const { provider } = stubProvider({ plan: [[[3, 4]]] });
    const [vec] = await embedIntent(["x"], { provider, intent: "document" });
    expect(vec, "vec: " + JSON.stringify(vec)).toBeDefined();
    expect(vec?.[0]).toBeCloseTo(0.6, 12);
    expect(vec?.[1]).toBeCloseTo(0.8, 12);
    const norm = Math.sqrt((vec ?? []).reduce((acc, x) => acc + x * x, 0));
    expect(norm, "norm: " + norm).toBeCloseTo(1.0, 12);
  });

  it("refuses a count mismatch, naming both counts", async () => {
    const { provider } = stubProvider({ plan: [[[1, 0]]] });
    await expect(embedIntent(["a", "b"], { provider, intent: "document" })).rejects.toThrow(
      "embedding count mismatch: sent 2, got 1",
    );
  });

  it("refuses degenerate vectors: all-zero and non-finite (correct dimension)", async () => {
    for (const bad of [[[0, 0]], [[1, Number.NaN]]] as number[][][]) {
      const { provider } = stubProvider({ plan: [bad] });
      await expect(
        embedIntent(["x"], { provider, intent: "document" }),
        "bad batch: " + JSON.stringify(bad),
      ).rejects.toThrow("degenerate embedding (empty / all-zero / non-finite)");
    }
  });

  it("refuses a wrong-dimension vector at the boundary — a provider ignoring the declared width", async () => {
    // An empty or wrong-width vector is a DIMENSION mismatch, caught before it
    // reaches a pgvector query as a deep 500 or a paid-for ingest batch
    // (review finding #9, 2026-08-19).
    for (const bad of [[[]], [[1, 2, 3]]] as number[][][]) {
      const { provider } = stubProvider({ plan: [bad] });
      await expect(
        embedIntent(["x"], { provider, intent: "document" }),
        "bad batch: " + JSON.stringify(bad),
      ).rejects.toThrow(/embedding dimension mismatch/);
    }
  });

  it("applies the same contract on the query door", async () => {
    const { provider } = stubProvider({ plan: [[[0, 5]]] });
    const out = await aembedIntent(["q"], { provider, intent: "query" });
    expect(out, "out: " + JSON.stringify(out)).toEqual([[0, 1]]);
  });
});

describe("the two retry policies", () => {
  const rateLimit = Object.assign(new Error("429 rate limited"), { status: 429 });
  // the 429 asymmetry: ingest patient, read fail-fast (oracle test_resilience)
  const asymmetric = {
    retryable: (exc: unknown) => exc === rateLimit,
    retryableQuery: () => false,
  };

  it("ingest door retries a retryable failure (reset before each sleep) and then succeeds", async () => {
    vi.useFakeTimers();
    const { provider, calls, resets } = stubProvider({
      plan: [rateLimit, rateLimit, [[3, 4]]],
      ...asymmetric,
    });
    const pending = embedIntent(["x"], { provider, intent: "document" });
    await vi.runAllTimersAsync();
    const [vec] = await pending;
    expect(vec?.[0], "vec: " + JSON.stringify(vec)).toBeCloseTo(0.6, 12);
    expect(vec?.[1]).toBeCloseTo(0.8, 12);
    expect(calls(), "embed calls: " + calls()).toBe(3);
    expect(resets(), "resets: " + resets()).toBe(2);
  });

  it("ingest door stops after 5 attempts and reraises the ORIGINAL error", async () => {
    vi.useFakeTimers();
    const { provider, calls } = stubProvider({
      plan: [rateLimit, rateLimit, rateLimit, rateLimit, rateLimit, rateLimit],
      ...asymmetric,
    });
    const pending = embedIntent(["x"], { provider, intent: "document" });
    const assertion = expect(pending).rejects.toBe(rateLimit);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls(), "embed calls: " + calls()).toBe(5);
  });

  it("ingest door does not retry a non-retryable error", async () => {
    const poison = new Error("degenerate upstream");
    const { provider, calls } = stubProvider({ plan: [poison], ...asymmetric });
    await expect(embedIntent(["x"], { provider, intent: "document" })).rejects.toBe(poison);
    expect(calls()).toBe(1);
  });

  it("query door NEVER waits out a rate limit — one attempt, degrade now", async () => {
    const { provider, calls } = stubProvider({ plan: [rateLimit, [[3, 4]]], ...asymmetric });
    await expect(aembedIntent(["q"], { provider, intent: "query" })).rejects.toBe(rateLimit);
    expect(calls(), "embed calls: " + calls()).toBe(1); // the ingest door would have retried this
  });

  it("query door gives a transport blip exactly one retry (2 attempts)", async () => {
    vi.useFakeTimers();
    const blip = Object.assign(new Error("transient"), { code: "ECONNRESET" });
    const { provider, calls } = stubProvider({
      plan: [blip, blip, [[3, 4]]],
      retryableQuery: (exc) => exc === blip,
    });
    const pending = aembedIntent(["q"], { provider, intent: "query" });
    const assertion = expect(pending).rejects.toBe(blip);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls(), "embed calls: " + calls()).toBe(2);
  });
});

describe("generateText", () => {
  it("wraps the generator in the ingest-patient retry and forwards the token budget", async () => {
    vi.useFakeTimers();
    const blip = Object.assign(new Error("blip"), { status: 503 });
    let calls = 0;
    let resets = 0;
    const seen: Array<number | undefined> = [];
    const generator: TextGenerator = {
      generate(_prompt, opts) {
        calls += 1;
        seen.push(opts?.maxOutputTokens);
        if (calls === 1) return Promise.reject(blip);
        return Promise.resolve("synthesized");
      },
      isRetryable: (exc) => exc === blip,
      reset() {
        resets += 1;
      },
    };
    const pending = generateText("a prompt", { generator, maxOutputTokens: 32 });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("synthesized");
    expect(calls, "generate calls: " + calls).toBe(2);
    expect(resets).toBe(1);
    expect(seen, "seen budgets: " + JSON.stringify(seen)).toEqual([32, 32]);
  });
});
