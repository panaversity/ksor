/**
 * The version-keyed L1 result cache, proven with a FAKE CLOCK: TTL expiry,
 * per-segment LRU (search churn never evicts read entries), version-prefix
 * invalidation (a flip makes stale entries unlookupable — no delete), and
 * single-flight coalescing of the expensive miss compute.
 */

import { describe, expect, it } from "vitest";

import { MAX_ENTRIES, ReadCache, SEARCH_MAX_ENTRIES } from "./readcache.js";

interface Clock {
  now: number;
}

function cacheWith(
  options: { ttlS?: number; maxEntries?: number; searchMaxEntries?: number } = {},
): { cache: ReadCache; clock: Clock } {
  const clock: Clock = { now: 0 };
  const cache = new ReadCache({ nowS: () => clock.now, ttlS: options.ttlS ?? 60, ...options });
  return { cache, clock };
}

describe("L1 get/put with a fake clock", () => {
  it("serves within the TTL and expires after it", () => {
    const { cache, clock } = cacheWith({ ttlS: 60 });
    cache.put(["outline", "1:", "t", "c"], { nodes: [] });
    clock.now = 59;
    expect(cache.get(["outline", "1:", "t", "c"])).toEqual({ nodes: [] });
    clock.now = 61;
    expect(cache.get(["outline", "1:", "t", "c"])).toBeUndefined();
    expect(cache.stats().hits, JSON.stringify(cache.stats())).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it("honors a per-entry TTL over the default", () => {
    const { cache, clock } = cacheWith({ ttlS: 60 });
    cache.put(["search", "1:", "q"], { hits: [] }, 5);
    clock.now = 6;
    expect(cache.get(["search", "1:", "q"])).toBeUndefined();
  });

  it("evicts least-recently-used within the segment; a get refreshes recency", () => {
    const { cache } = cacheWith({ maxEntries: 2 });
    cache.put(["read", "v", "a"], 1);
    cache.put(["read", "v", "b"], 2);
    cache.get(["read", "v", "a"]); // touch: b is now the LRU
    cache.put(["read", "v", "c"], 3);
    expect(cache.get(["read", "v", "a"])).toBe(1);
    expect(cache.get(["read", "v", "b"]), "the untouched entry was evicted").toBeUndefined();
    expect(cache.get(["read", "v", "c"])).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it("search churn never evicts warm read entries (two segments)", () => {
    // oracle review search-evicts-reads: search's keyspace is unbounded —
    // one entry per query variant — so it gets its own LRU budget.
    const { cache } = cacheWith({ maxEntries: 4, searchMaxEntries: 2 });
    cache.put(["outline", "v", "t"], "warm-outline");
    cache.put(["read_document", "v", "slug"], "warm-read");
    for (let i = 0; i < 50; i += 1) cache.put(["search", "v", `query-${i}`], i);
    expect(cache.get(["outline", "v", "t"])).toBe("warm-outline");
    expect(cache.get(["read_document", "v", "slug"])).toBe("warm-read");
    expect(cache.stats().searchSize, JSON.stringify(cache.stats())).toBe(2);
  });

  it("ships the oracle's segment budgets", () => {
    expect(MAX_ENTRIES).toBe(512);
    expect(SEARCH_MAX_ENTRIES).toBe(256);
  });
});

describe("version keying — correctness is the VERSION, not the TTL", () => {
  it("a version flip makes every stale entry unlookupable without a delete", async () => {
    const { cache } = cacheWith();
    let calls = 0;
    const compute = async (): Promise<{ gen: number }> => {
      calls += 1;
      return { gen: calls };
    };
    const a = await cache.readThrough("42:abc", "outline", ["t", "c"], compute);
    const b = await cache.readThrough("42:abc", "outline", ["t", "c"], compute);
    expect(a).toEqual({ gen: 1 });
    expect(b, "second read within the version is a cache hit").toEqual({ gen: 1 });
    // The flip: generation or deny-hash changed — same logical key, new version.
    const c = await cache.readThrough("43:abc", "outline", ["t", "c"], compute);
    expect(c, "a flipped version must recompute").toEqual({ gen: 2 });
    const d = await cache.readThrough("42:def", "outline", ["t", "c"], compute);
    expect(d, "a takedown (deny-hash change) must recompute").toEqual({ gen: 3 });
    expect(calls).toBe(3);
  });

  it("vput/vget route by the namespace at logical[0] and respect the version", () => {
    const { cache } = cacheWith();
    cache.vput("1:x", ["search", "q1"], { hits: [1] });
    expect(cache.vget("1:x", ["search", "q1"])).toEqual({ hits: [1] });
    expect(cache.vget("2:x", ["search", "q1"]), "new version, no hit").toBeUndefined();
    expect(cache.stats().searchSize, "search namespace routed to its own segment").toBe(1);
    expect(cache.stats().size).toBe(0);
  });
});

describe("readThrough", () => {
  it("an uncacheable result is served but never stored", async () => {
    // e.g. never cache an embed-outage degrade.
    const { cache } = cacheWith();
    let calls = 0;
    const compute = async (): Promise<{ degraded: boolean }> => {
      calls += 1;
      return { degraded: true };
    };
    const opts = { cacheable: (v: { degraded: boolean }) => !v.degraded };
    expect(await cache.readThrough("v", "search", ["q"], compute, opts)).toEqual({
      degraded: true,
    });
    expect(await cache.readThrough("v", "search", ["q"], compute, opts)).toEqual({
      degraded: true,
    });
    expect(calls, "an uncacheable result must recompute every time").toBe(2);
  });

  it("expiry re-computes and re-fills", async () => {
    const { cache, clock } = cacheWith({ ttlS: 60 });
    let calls = 0;
    const compute = async (): Promise<number> => {
      calls += 1;
      return calls;
    };
    expect(await cache.readThrough("v", "outline", ["t"], compute)).toBe(1);
    clock.now = 61;
    expect(await cache.readThrough("v", "outline", ["t"], compute)).toBe(2);
    expect(calls).toBe(2);
  });
});

describe("single-flight (computeOnce)", () => {
  it("concurrent identical misses coalesce behind one compute", async () => {
    const { cache } = cacheWith();
    let calls = 0;
    let release: (value: { built: boolean }) => void = () => undefined;
    const gate = new Promise<{ built: boolean }>((resolve) => {
      release = resolve;
    });
    const compute = (): Promise<{ built: boolean }> => {
      calls += 1;
      return gate;
    };
    const flights = Promise.all(
      Array.from({ length: 12 }, () => cache.readThrough("v", "read_document", ["slug"], compute)),
    );
    release({ built: true });
    const results = await flights;
    expect(calls, "the cohort must not stampede the DB").toBe(1);
    for (const r of results) expect(r).toEqual({ built: true });
    expect(cache.stats().coalesced, JSON.stringify(cache.stats())).toBe(11);
    expect(cache.stats().inflight, "registry must drain").toBe(0);
  });

  it("an owner failure is shared with every waiter, never re-run per waiter", async () => {
    // A deterministic failure (unknown slug) would re-fail identically —
    // re-running it once per waiter is N pointless serial DB round-trips.
    const { cache } = cacheWith();
    let calls = 0;
    let reject: (error: Error) => void = () => undefined;
    const gate = new Promise<never>((_resolve, rej) => {
      reject = rej;
    });
    const compute = (): Promise<never> => {
      calls += 1;
      return gate;
    };
    const flights = Array.from({ length: 3 }, () =>
      cache.readThrough("v", "read_document", ["nope"], compute).then(
        () => "resolved",
        (error: Error) => error.message,
      ),
    );
    reject(new Error("no document with slug"));
    expect(await Promise.all(flights)).toEqual([
      "no document with slug",
      "no document with slug",
      "no document with slug",
    ]);
    expect(calls).toBe(1);
    // A client retry re-enters as a fresh single-flight (registry drained).
    await expect(
      cache.readThrough("v", "read_document", ["nope"], async () => "second try"),
    ).resolves.toBe("second try");
  });

  it("a failed compute caches nothing", async () => {
    const { cache } = cacheWith();
    await expect(
      cache.readThrough("v", "outline", ["t"], async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrowError("boom");
    expect(cache.stats().size).toBe(0);
  });
});

describe("stats and clear", () => {
  it("clear drops entries, inflight bookkeeping, and counters", async () => {
    const { cache } = cacheWith();
    cache.put(["outline", "v", "a"], 1);
    cache.put(["search", "v", "q"], 2);
    cache.get(["outline", "v", "a"]);
    cache.clear();
    expect(cache.stats()).toEqual({
      hits: 0,
      misses: 0,
      evictions: 0,
      coalesced: 0,
      size: 0,
      searchSize: 0,
      inflight: 0,
    });
  });
});
