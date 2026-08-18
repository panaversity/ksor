/**
 * Query-embedding cache, converted from the oracle (sor-agentfactory @
 * b554f91, sor_content/lib/query_embed.py): L1 in-process LRU + SINGLE-FLIGHT
 * (concurrent identical misses share ONE paid embed), keyed with
 * model + task + dim so a model or dimension bump can never serve a stale
 * vector. Whitespace collapses; case does NOT fold (folding would change the
 * embedded text).
 *
 * A tiny CIRCUIT BREAKER guards the provider: after an embed failure, further
 * misses raise immediately for a short cooldown (cache hits still serve) —
 * during an outage every request degrades to keyword-only instantly instead
 * of each unique query paying its own failed attempt against a provider that
 * is already down. The breaker is keyed per SPACE (modelId, dim), like the
 * keys: a failing provider A must not degrade a healthy provider B.
 *
 * Conversion notes (decision 6):
 * - The oracle's optional Redis L2 (fail-open both directions, TTL
 *   SOR_EMBED_CACHE_TTL, the `sor:emb:*` key scheme) is DROPPED — it was
 *   multi-instance infrastructure; the L1 + single-flight carry a
 *   single-process deployment. It returns, if ever, with real multi-instance
 *   serving — nothing here forecloses it.
 * - The oracle's waiter-shield (`asyncio.shield`) and owner-cancel handling
 *   protected the shared future from one caller's cancellation. JS promises
 *   are not cancellable, so sharing the promise IS the whole mechanism: no
 *   caller can cancel another, and there is no owner-cancelled path to map.
 * - `asyncio.wait_for` CANCELLED the embed on timeout; a JS promise cannot be
 *   cancelled, so on timeout the losing call is abandoned (its settlement is
 *   still observed, so it can never surface as an unhandled rejection) and
 *   runs out its own HTTP timeout in the background.
 * - The breaker clock is Date.now() (ms) rather than a monotonic clock — the
 *   10 s cooldown is coarse, and fake-timer tests need the system clock.
 */

import { aembedIntent, envFloat, envInt, vlit } from "./embedding.js";
import type { EmbeddingProvider } from "./embedding.js";

// Each L1 entry is a ~1536-float pgvector literal (~25 KB), so 10k entries
// ≈ 250 MB — the dominant in-process footprint. Env-tunable (fail-soft) so
// an operator can shrink it to fit a smaller memory allocation.
/** Oracle env var: SOR_EMBED_CACHE_MAX. */
const CACHE_MAX_INITIAL: number = envInt("KSOR_EMBED_CACHE_MAX", 10000, 1);
let cacheMax: number = CACHE_MAX_INITIAL;

export const BREAKER_COOLDOWN_S = 10.0;

// The QUERY path's hard wall-clock bound. Without it a provider HANG
// (brownout, no exception) puts every search behind an unbounded await — the
// degrade path and the breaker only fire on RAISED errors, so a hang defeats
// both (oracle E2E review SB8). Deliberately the SAME env var embedding.ts
// reads with default 10.0 as the per-request HTTP timeout — two reads, two
// defaults, carried from the oracle (query_embed.py:44 vs embedding.py:62).
/** Oracle env var: SOR_QUERY_EMBED_TIMEOUT_S. */
export const EMBED_WALL_TIMEOUT_S: number = envFloat("KSOR_QUERY_EMBED_TIMEOUT_S", 5.0, 0.1);

// L1 (insertion-ordered Map → LRU), the in-flight map, and the breaker are
// MODULE-GLOBAL: one embedding space per process is the deployed shape. A
// process composing two providers shares the maps but never the entries —
// model/task/dim are in every key, and the breaker is per space.
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const breakerOpenUntilByMs = new Map<string, number>();

/** The breaker is open — the provider failed within the cooldown window; degrade now. */
export class QueryEmbedUnavailable extends Error {
  override readonly name: string = "QueryEmbedUnavailable";
}

/** The query is empty — a CLIENT error (400-class), not a provider outage.
 * Deliberately distinct from the provider errors `aembedIntent` can raise
 * (count mismatch, degenerate vector): the read path re-raises THIS but
 * DEGRADES provider failures to keyword-only, so a vendor brownout never
 * hard-fails a reader's search. */
export class EmptyQueryError extends Error {
  override readonly name: string = "EmptyQueryError";
}

/** The wall clock elapsed before the provider answered — treated exactly like
 * a raised provider failure (degrades the caller, trips the breaker). The
 * oracle surfaced asyncio.TimeoutError here; TS needs its own class. */
export class QueryEmbedTimeoutError extends Error {
  override readonly name: string = "QueryEmbedTimeoutError";
}

function normalize(query: string): string {
  return query.split(/\s+/).filter(Boolean).join(" ");
}

/** The in-process key — the oracle's L1 tuple (query, model, query-task
 * label, dim) in the oracle's order, serialized collision-free. */
function l1Key(normalized: string, provider: EmbeddingProvider): string {
  return JSON.stringify([normalized, provider.modelId, provider.queryTaskLabel, provider.dim]);
}

function spaceKey(provider: EmbeddingProvider): string {
  return JSON.stringify([provider.modelId, provider.dim]);
}

/** When THIS provider's breaker re-closes, as a Date.now() timestamp in ms
 * (0 = closed) — the per-space read. */
export function breakerOpenUntil(provider: EmbeddingProvider): number {
  return breakerOpenUntilByMs.get(spaceKey(provider)) ?? 0;
}

function withWallClock(work: Promise<number[][]>): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // The losing embed cannot be cancelled (module note); its settlement is
      // already observed by the handlers below, so nothing goes unhandled.
      reject(
        new QueryEmbedTimeoutError(
          `query embed exceeded the ${EMBED_WALL_TIMEOUT_S}s wall clock — treated as a provider failure (degrade to keyword-only)`,
        ),
      );
    }, EMBED_WALL_TIMEOUT_S * 1000);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (exc: unknown) => {
        clearTimeout(timer);
        reject(exc instanceof Error ? exc : new Error(String(exc)));
      },
    );
  });
}

async function embedMiss(
  normalized: string,
  key: string,
  provider: EmbeddingProvider,
): Promise<string> {
  try {
    // Only a MISS consults the provider — gate on the breaker (a recent
    // provider failure degrades instantly instead of every unique query
    // re-hitting a provider that is already down).
    if (Date.now() < breakerOpenUntil(provider)) {
      throw new QueryEmbedUnavailable(
        "query-embed breaker open (recent provider failure) — degrade",
      );
    }
    // The INTENT-NATIVE door: "query" goes to the adapter as an intent, never
    // as a label string — an equal-label provider can never embed a read with
    // document intent under a cache key that says query (oracle review 2026-08-16).
    const vecs = await withWallClock(aembedIntent([normalized], { provider, intent: "query" }));
    const vec = vecs[0];
    if (vec === undefined) {
      // unreachable: aembedIntent's contract enforces count == inputs
      throw new Error("embedding count mismatch: sent 1, got 0");
    }
    const literal = vlit(vec);
    cache.delete(key);
    cache.set(key, literal); // insert at the LRU tail
    while (cache.size > cacheMax) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return literal;
  } catch (exc) {
    if (!(exc instanceof QueryEmbedUnavailable)) {
      // A REAL provider failure/timeout trips the breaker for THIS space. A
      // breaker-open QueryEmbedUnavailable must NOT re-trip/extend the cooldown.
      breakerOpenUntilByMs.set(spaceKey(provider), Date.now() + BREAKER_COOLDOWN_S * 1000);
    }
    throw exc;
  }
}

/**
 * The query's pgvector literal (the provider's QUERY intent — RETRIEVAL_QUERY
 * on Gemini — L2-normalized), cached + single-flight. Empty queries are
 * refused HERE — the one chokepoint before the paid API. The transport is the
 * provider's; the CONTRACT (normalize, count check, degenerate rejection, the
 * fail-fast retry) is `aembedIntent`'s.
 */
export async function embedQueryVlit(
  query: string,
  opts: { provider: EmbeddingProvider },
): Promise<string> {
  const { provider } = opts;
  const normalized = normalize(query);
  if (normalized === "") {
    throw new EmptyQueryError("query is empty — nothing to embed");
  }
  const key = l1Key(normalized, provider);

  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached); // move to the LRU tail
    return cached;
  }

  const pending = inflight.get(key);
  if (pending !== undefined) {
    // Share the owner's promise — the single-flight. No shield needed: JS
    // callers cannot cancel each other's awaits (module note).
    return pending;
  }

  const owned = embedMiss(normalized, key, provider);
  inflight.set(key, owned);
  try {
    return await owned;
  } finally {
    inflight.delete(key);
  }
}

/** Test seam: reset module state (and the env-derived cache cap) between
 * tests; shrink the cap to make eviction observable. Never a production path. */
export const _testing: { reset(): void; setCacheMax(n: number): void } = {
  reset(): void {
    cache.clear();
    inflight.clear();
    breakerOpenUntilByMs.clear();
    cacheMax = CACHE_MAX_INITIAL;
  },
  setCacheMax(n: number): void {
    cacheMax = n;
  },
};
