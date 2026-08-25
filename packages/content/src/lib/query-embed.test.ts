import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "./embedding.js";
import {
  _testing,
  breakerOpenUntil,
  embedQueryVlit,
  EmptyQueryError,
  QueryEmbedTimeoutError,
  QueryEmbedUnavailable,
} from "./query-embed.js";

/** A dim-4 counting provider whose behavior per call is scriptable. Both
 * retry predicates are false, so `aembedIntent` makes exactly ONE transport
 * attempt per embed — call counts below are exact. */
function countingProvider(opts?: {
  modelId?: string;
  dim?: number;
  next?: () => Promise<number[][]>;
}): { provider: EmbeddingProvider; calls: () => number } {
  let calls = 0;
  const dim = opts?.dim ?? 4;
  const modelId = opts?.modelId ?? "stub-model";
  const provider: EmbeddingProvider = {
    providerId: "stub",
    modelId,
    dim,
    documentTaskLabel: "DOC",
    queryTaskLabel: "QRY",
    recipe: `${modelId}/d${dim}/DOC`,
    embed(_texts, _opts) {
      calls += 1;
      if (opts?.next) return opts.next();
      const vec = [3, 4, ...Array.from({ length: dim - 2 }, () => 0)];
      return Promise.resolve([vec]);
    },
    isRetryable: () => false,
    isRetryableQuery: () => false,
    reset() {},
  };
  return { provider, calls: () => calls };
}

beforeEach(() => {
  _testing.reset();
});

afterEach(() => {
  vi.useRealTimers();
  _testing.reset();
});

describe("empty-query refusal", () => {
  it("refuses empty and whitespace-only queries with the distinct client-error class", async () => {
    const { provider, calls } = countingProvider();
    await expect(embedQueryVlit("", { provider })).rejects.toBeInstanceOf(EmptyQueryError);
    await expect(embedQueryVlit("   \t\n ", { provider })).rejects.toBeInstanceOf(EmptyQueryError);
    expect(calls(), "provider calls: " + calls()).toBe(0); // the chokepoint sits before the paid API
  });
});

describe("the L1 cache", () => {
  it("misses once, then serves the identical literal from cache", async () => {
    const { provider, calls } = countingProvider();
    const first = await embedQueryVlit("what is an ai agent", { provider });
    const second = await embedQueryVlit("what is an ai agent", { provider });
    expect(second, "literal: " + first).toBe(first);
    expect(calls(), "provider calls: " + calls()).toBe(1);
    // normalized [3,4,0,0] → the framework's L2 + vlit's 8-decimal wire format
    expect(first).toBe("[0.60000000,0.80000000,0.00000000,0.00000000]");
  });

  it("collapses whitespace but never folds case", async () => {
    const { provider, calls } = countingProvider();
    await embedQueryVlit("  what   is\tan ai agent ", { provider });
    await embedQueryVlit("what is an ai agent", { provider });
    expect(calls(), "provider calls after whitespace variants: " + calls()).toBe(1);
    await embedQueryVlit("What is an ai agent", { provider });
    expect(calls(), "provider calls after case variant: " + calls()).toBe(2); // folding would change the embedded text
  });

  it("keys carry model and dim — two spaces never share an entry", async () => {
    const a = countingProvider({ modelId: "model-a", dim: 4 });
    const b = countingProvider({ modelId: "model-b", dim: 8 });
    await embedQueryVlit("same query", { provider: a.provider });
    await embedQueryVlit("same query", { provider: b.provider });
    expect(a.calls(), "a calls: " + a.calls()).toBe(1);
    expect(b.calls(), "b calls: " + b.calls()).toBe(1); // a's entry can never serve b
  });

  it("evicts least-recently-used past the cap", async () => {
    _testing.setCacheMax(2);
    const { provider, calls } = countingProvider();
    await embedQueryVlit("q1", { provider }); // miss (1)
    await embedQueryVlit("q2", { provider }); // miss (2)
    await embedQueryVlit("q1", { provider }); // hit — q1 moves to the tail
    await embedQueryVlit("q3", { provider }); // miss (3) — evicts q2, the LRU
    await embedQueryVlit("q1", { provider }); // still cached
    expect(calls(), "provider calls before re-fetch: " + calls()).toBe(3);
    await embedQueryVlit("q2", { provider }); // evicted → miss (4)
    expect(calls(), "provider calls after re-fetch: " + calls()).toBe(4);
  });
});

describe("single-flight", () => {
  it("concurrent identical misses share ONE paid embed", async () => {
    let release: ((v: number[][]) => void) | undefined;
    const { provider, calls } = countingProvider({
      next: () =>
        new Promise<number[][]>((resolve) => {
          release = resolve;
        }),
    });
    const first = embedQueryVlit("q", { provider });
    const second = embedQueryVlit("q", { provider });
    expect(release, "the owner's embed must be in flight").toBeDefined();
    release?.([[3, 4, 0, 0]]);
    const [a, b] = await Promise.all([first, second]);
    expect(a, "owner literal: " + a).toBe(b);
    expect(calls(), "provider calls: " + calls()).toBe(1);
  });

  it("a shared failure rejects every waiter, and the key is not poisoned", async () => {
    let fail: ((exc: Error) => void) | undefined;
    const boom = new Error("provider down");
    let scripted = true;
    const { provider, calls } = countingProvider({
      next: () => {
        if (scripted) {
          return new Promise<number[][]>((_resolve, reject) => {
            fail = reject;
          });
        }
        return Promise.resolve([[3, 4, 0, 0]]);
      },
    });
    const first = embedQueryVlit("q", { provider });
    const second = embedQueryVlit("q", { provider });
    const firstAssertion = expect(first).rejects.toBe(boom);
    const secondAssertion = expect(second).rejects.toBe(boom);
    fail?.(boom);
    await firstAssertion;
    await secondAssertion;
    expect(calls(), "provider calls: " + calls()).toBe(1);
    // the failed in-flight entry is gone; after the cooldown the query retries
    scripted = false;
    vi.useFakeTimers();
    vi.advanceTimersByTime(10_001);
    await expect(embedQueryVlit("q", { provider })).resolves.toContain("[");
    expect(calls(), "provider calls after heal: " + calls()).toBe(2);
  });
});

describe("the circuit breaker", () => {
  it("opens on a provider failure and sheds the NEXT unique query without a provider call", async () => {
    vi.useFakeTimers();
    const boom = new Error("provider down");
    let healthy = false;
    const { provider, calls } = countingProvider({
      next: () => (healthy ? Promise.resolve([[3, 4, 0, 0]]) : Promise.reject(boom)),
    });
    await expect(embedQueryVlit("first unique query", { provider })).rejects.toBe(boom);
    expect(calls()).toBe(1);
    expect(breakerOpenUntil(provider), "breaker: " + breakerOpenUntil(provider)).toBeGreaterThan(
      Date.now(),
    );
    await expect(embedQueryVlit("second unique query", { provider })).rejects.toBeInstanceOf(
      QueryEmbedUnavailable,
    );
    expect(calls(), "provider calls during cooldown: " + calls()).toBe(1); // instant degrade
    // the breaker re-closes after the 10 s cooldown
    healthy = true;
    vi.advanceTimersByTime(10_001);
    await expect(embedQueryVlit("third unique query", { provider })).resolves.toContain("[");
    expect(calls()).toBe(2);
  });

  it("a breaker-open shed does NOT re-extend the cooldown", async () => {
    vi.useFakeTimers();
    const boom = new Error("provider down");
    let healthy = false;
    const { provider, calls } = countingProvider({
      next: () => (healthy ? Promise.resolve([[3, 4, 0, 0]]) : Promise.reject(boom)),
    });
    await expect(embedQueryVlit("q1", { provider })).rejects.toBe(boom);
    const openedUntil = breakerOpenUntil(provider);
    vi.advanceTimersByTime(9_000);
    await expect(embedQueryVlit("q2", { provider })).rejects.toBeInstanceOf(QueryEmbedUnavailable);
    expect(breakerOpenUntil(provider), "cooldown after shed: " + breakerOpenUntil(provider)).toBe(
      openedUntil, // the shed at t0+9s must not push the close-time to t0+19s
    );
    healthy = true;
    vi.advanceTimersByTime(1_500); // t0 + 10.5 s — past the ORIGINAL cooldown
    await expect(embedQueryVlit("q3", { provider })).resolves.toContain("[");
    expect(calls(), "provider calls: " + calls()).toBe(2);
  });

  it("never blocks cache hits — an outage serves warm queries", async () => {
    vi.useFakeTimers();
    const boom = new Error("provider down");
    let healthy = true;
    const { provider, calls } = countingProvider({
      next: () => (healthy ? Promise.resolve([[3, 4, 0, 0]]) : Promise.reject(boom)),
    });
    const warm = await embedQueryVlit("cached query", { provider });
    healthy = false;
    await expect(embedQueryVlit("uncached query", { provider })).rejects.toBe(boom); // trips the breaker
    await expect(embedQueryVlit("cached query", { provider })).resolves.toBe(warm); // L1 hit serves mid-outage
    await expect(embedQueryVlit("another uncached", { provider })).rejects.toBeInstanceOf(
      QueryEmbedUnavailable,
    );
    expect(calls(), "provider calls: " + calls()).toBe(2);
  });

  it("is keyed per space — a failing provider never sheds a healthy one", async () => {
    const failing = countingProvider({
      modelId: "model-a",
      next: () => Promise.reject(new Error("provider A down")),
    });
    const healthy = countingProvider({ modelId: "model-b" });
    await expect(embedQueryVlit("q-a", { provider: failing.provider })).rejects.toThrow(
      "provider A down",
    );
    expect(breakerOpenUntil(failing.provider)).toBeGreaterThan(0);
    expect(breakerOpenUntil(healthy.provider), "healthy breaker must stay closed").toBe(0);
    await expect(embedQueryVlit("q-b", { provider: healthy.provider })).resolves.toContain("[");
    await expect(embedQueryVlit("q-a2", { provider: failing.provider })).rejects.toBeInstanceOf(
      QueryEmbedUnavailable,
    );
  });
});

describe("env knobs are read lazily, not frozen at module scope (issue #149)", () => {
  afterEach(() => {
    delete process.env["KSOR_EMBED_CACHE_MAX"];
    delete process.env["KSOR_QUERY_EMBED_TIMEOUT_S"];
  });

  it("honors KSOR_EMBED_CACHE_MAX set after import — no _testing.setCacheMax involved", async () => {
    // Before the fix, CACHE_MAX_INITIAL was a module-scope `const` evaluated
    // at import — before cli.ts's main() ever calls loadDotEnv() — so this
    // env var could never take effect once the process was running. Setting
    // it here, after import, and then relying only on the public
    // `_testing.reset()` seam (never `setCacheMax`) is exactly the case that
    // was impossible to honor before the fix.
    process.env["KSOR_EMBED_CACHE_MAX"] = "2";
    _testing.reset();
    const { provider, calls } = countingProvider();
    await embedQueryVlit("q1", { provider }); // miss (1)
    await embedQueryVlit("q2", { provider }); // miss (2)
    await embedQueryVlit("q1", { provider }); // hit — q1 moves to the tail
    await embedQueryVlit("q3", { provider }); // miss (3) — evicts q2, the LRU, at cap 2
    await embedQueryVlit("q1", { provider }); // still cached
    expect(calls(), "provider calls before re-fetch: " + calls()).toBe(3);
    await embedQueryVlit("q2", { provider }); // evicted → miss (4)
    expect(calls(), "provider calls after re-fetch: " + calls()).toBe(4);
  });

  it("honors KSOR_QUERY_EMBED_TIMEOUT_S set after import — the wall clock fires early", async () => {
    // Before the fix, EMBED_WALL_TIMEOUT_S was frozen at its 5s default
    // regardless of this env var.
    process.env["KSOR_QUERY_EMBED_TIMEOUT_S"] = "1";
    vi.useFakeTimers();
    const { provider, calls } = countingProvider({
      next: () => new Promise<number[][]>(() => {}), // a hang, never settles
    });
    const pending = embedQueryVlit("a hanging query, short custom timeout", { provider });
    const assertion = expect(pending).rejects.toBeInstanceOf(QueryEmbedTimeoutError);
    await vi.advanceTimersByTimeAsync(1_001); // would need 5_001 before the fix
    await assertion;
    expect(calls()).toBe(1);
  });
});

describe("the wall clock", () => {
  it("bounds a provider HANG: times out with the timeout class and trips the breaker", async () => {
    vi.useFakeTimers();
    const { provider, calls } = countingProvider({
      next: () => new Promise<number[][]>(() => {}), // a hang, not an error — the case the breaker can't see
    });
    const pending = embedQueryVlit("a hanging query", { provider });
    const assertion = expect(pending).rejects.toBeInstanceOf(QueryEmbedTimeoutError);
    await vi.advanceTimersByTimeAsync(5_001); // default KSOR_QUERY_EMBED_TIMEOUT_S wall clock: 5 s
    await assertion;
    expect(calls()).toBe(1);
    // the timeout is a provider failure: the breaker is now open for this space
    await expect(embedQueryVlit("the next query", { provider })).rejects.toBeInstanceOf(
      QueryEmbedUnavailable,
    );
    expect(calls(), "provider calls after timeout: " + calls()).toBe(1);
  });
});
