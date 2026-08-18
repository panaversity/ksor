/**
 * The read-result cache for the DETERMINISTIC reads (search, outline,
 * read_document) — VERSION-KEYED, in-process L1 (oracle SC/lib/readcache.py).
 *
 * CORRECTNESS IS THE VERSION, not the TTL. Every key is prefixed with the
 * corpus VERSION (`{active_generation}:{deny_hash}` — the pair
 * `outlineVersion()` computes), so a flip or takedown changes the version
 * and every stale entry becomes UNLOOKUPABLE (no delete, no scan, no
 * race); it just expires on its own TTL. Freshness is therefore the
 * caller's version-resolution window, not the result TTL.
 *
 * The oracle carried a second tier (Redis, shared across a Cloud Run
 * fleet, surviving scale-to-0). NOT ported: multi-instance infrastructure
 * a single-process `ksor serve` does not have (decision 6 — ask what a
 * mechanism was for). The oracle's own contract makes this exact: with no
 * Redis it fails open to "exactly the old L1-only behavior — a single
 * instance is fully correct with no Redis at all". L2 returns with the
 * first multi-instance deployment.
 *
 * A cache hit is still a served read — the caller runs rate-limit and the
 * audit row on every call.
 */

import { envFloat } from "@panaversity/ksor-platform";

export type CacheKey = readonly (string | number | boolean | null)[];

/**
 * Default 60 s — the SOLE freshness bound for outline/read_document within
 * one version: a flip/takedown propagates via the version prefix; this TTL
 * covers changes the version does not encode. 60 s absorbs a cohort spike
 * (the first read fills the cache, the rest coalesce) while keeping
 * content changes visible within a minute. Fail-soft parse: a malformed
 * value warns and uses the default rather than refusing to boot. ≥1 s —
 * 0/negative would disable the cache.
 */
export const DEFAULT_TTL_S = 60.0;
export const MAX_ENTRIES = 512;
/**
 * SEARCH gets a SEPARATE LRU segment (oracle review: search-evicts-reads).
 * Its keyspace is unbounded (one entry per distinct query variant), so if
 * it shared the reads' 512 slots a burst of varied queries would evict the
 * warm outline/read entries the cache exists to protect. Two segments,
 * routed by the namespace tag at key[0], keep each workload's budget its
 * own.
 */
export const SEARCH_MAX_ENTRIES = 256;

interface Entry {
  readonly atS: number;
  readonly value: unknown;
  readonly ttlS: number;
}

export interface ReadCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly coalesced: number;
  readonly size: number;
  readonly searchSize: number;
  readonly inflight: number;
}

export interface ReadCacheOptions {
  /** Monotonic clock in SECONDS — injectable for tests (fake clock). */
  readonly nowS?: () => number;
  readonly ttlS?: number;
  readonly maxEntries?: number;
  readonly searchMaxEntries?: number;
}

const monotonicS = (): number => performance.now() / 1000;

/** The logical key serialized deterministically — array order is the identity. */
function serialize(key: CacheKey): string {
  return JSON.stringify(key);
}

export class ReadCache {
  private readonly nowS: () => number;
  private readonly ttlS: number;
  private readonly maxEntries: number;
  private readonly searchMaxEntries: number;
  /** Insertion order is LRU order: a touch deletes + re-inserts at the end. */
  private readonly reads = new Map<string, Entry>();
  private readonly searches = new Map<string, Entry>();
  /**
   * Single-flight registry: while one caller computes a cold key,
   * concurrent identical misses await the same promise instead of each
   * running the expensive walk/chunk-fetch (the oracle's documented
   * PoolTimeout stampede on a cohort hitting a cold cache). JS promises are
   * not cancellable, so the oracle's shielded-waiter / owner-cancellation
   * re-coalesce machinery has no equivalent here; a rejection is naturally
   * shared with every waiter — a deterministic failure is never re-run per
   * waiter.
   */
  private readonly inflightMap = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private coalesced = 0;

  constructor(options: ReadCacheOptions = {}) {
    this.nowS = options.nowS ?? monotonicS;
    this.ttlS = options.ttlS ?? envFloat("KSOR_READ_CACHE_TTL_S", DEFAULT_TTL_S, 1.0);
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
    this.searchMaxEntries = options.searchMaxEntries ?? SEARCH_MAX_ENTRIES;
  }

  /** Route a key to its (LRU segment, capacity) by the namespace tag at key[0]. */
  private segment(key: CacheKey): { seg: Map<string, Entry>; cap: number } {
    if (key[0] === "search") return { seg: this.searches, cap: this.searchMaxEntries };
    return { seg: this.reads, cap: this.maxEntries };
  }

  get(key: CacheKey): unknown {
    const { seg } = this.segment(key);
    const k = serialize(key);
    const entry = seg.get(k);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }
    if (this.nowS() - entry.atS > entry.ttlS) {
      seg.delete(k);
      this.misses += 1;
      return undefined;
    }
    seg.delete(k); // LRU touch: re-insert at the end
    seg.set(k, entry);
    this.hits += 1;
    return entry.value;
  }

  put(key: CacheKey, value: unknown, ttlS?: number): void {
    const { seg, cap } = this.segment(key);
    const k = serialize(key);
    seg.delete(k);
    seg.set(k, { atS: this.nowS(), value, ttlS: ttlS ?? this.ttlS });
    // Evict within THIS segment only — search churn never touches read entries.
    while (seg.size > cap) {
      const oldest = seg.keys().next().value;
      if (oldest === undefined) break;
      seg.delete(oldest);
      this.evictions += 1;
    }
  }

  /**
   * The version-keyed read: L1 → single-flight(compute). Returns the
   * CANONICAL value (shared with single-flight waiters); the caller copies
   * + stamps before serving. `version` prefixes every key, so a
   * flip/takedown rolls the whole cache without a delete.
   * `cacheable(result)` gates whether a computed result is stored (e.g.
   * never cache an embed-outage degrade).
   */
  async readThrough<T>(
    version: string,
    namespace: string,
    logical: CacheKey,
    compute: () => Promise<T>,
    options: { l1TtlS?: number; cacheable?: (value: T) => boolean } = {},
  ): Promise<T> {
    const full: CacheKey = [namespace, version, ...logical];
    const hit = this.get(full);
    if (hit !== undefined) return hit as T;
    return this.computeOnce(full, async () => {
      const built = await compute();
      if (options.cacheable === undefined || options.cacheable(built)) {
        this.put(full, built, options.l1TtlS);
      }
      return built;
    });
  }

  /**
   * Version-keyed lookup for a caller that owns its own control flow
   * (search: no single-flight, a conditional put, a bespoke serve).
   * Namespace = `logical[0]`.
   */
  vget(version: string, logical: CacheKey): unknown {
    const ns = String(logical[0]);
    return this.get([ns, version, ...logical]);
  }

  /** Version-keyed store (the companion to vget). */
  vput(version: string, logical: CacheKey, value: unknown, ttlS?: number): void {
    const ns = String(logical[0]);
    this.put([ns, version, ...logical], value, ttlS);
  }

  /**
   * Single-flight the EXPENSIVE miss compute. Call ONLY after get() missed.
   * The first caller runs `compute` (which owns caching); concurrent
   * identical misses await its result instead of stampeding the DB.
   */
  async computeOnce<T>(key: CacheKey, compute: () => Promise<T>): Promise<T> {
    const k = serialize(key);
    const pending = this.inflightMap.get(k);
    if (pending !== undefined) {
      const value = (await pending) as T;
      // Count only work TRULY saved (a completed coalesced await) — a
      // shared rejection propagates above without incrementing.
      this.coalesced += 1;
      return value;
    }
    const p = compute();
    this.inflightMap.set(k, p);
    try {
      return await p;
    } finally {
      this.inflightMap.delete(k);
    }
  }

  /**
   * A snapshot of cache effectiveness — read by load harnesses (and safe
   * to log) to SHOW the cache is working rather than assert it.
   */
  stats(): ReadCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      coalesced: this.coalesced,
      size: this.reads.size,
      searchSize: this.searches.size,
      inflight: this.inflightMap.size,
    };
  }

  /** Test hook — drop everything, including in-flight bookkeeping + stats. */
  clear(): void {
    this.reads.clear();
    this.searches.clear();
    this.inflightMap.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.coalesced = 0;
  }
}

/** The process-global instance the serve composition uses (oracle parity: module-global cache). */
export const readCache: ReadCache = new ReadCache();
