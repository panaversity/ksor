/**
 * The eval-locked embedding contract — the FRAMEWORK side of the provider
 * seam, converted from the oracle (sor-agentfactory @ b554f91,
 * sor_content/lib/embedding.py + lib/provider.py).
 *
 * The adapter owns TRANSPORT (the raw API call, its exception taxonomy, its
 * client lifecycle, its per-call timeouts, its task-type vocabulary); this
 * module owns the CONTRACT: L2 re-normalization (MANDATORY — 1536 is an MRL
 * truncation of the native 3072; only the native size arrives normalized, so
 * skipping this makes cosine subtly wrong), the count check, degenerate
 * rejection (a NaN cosine poisons ranking — quarantine, never store), and the
 * two retry policies. Adapters never normalize, never retry, never swallow.
 *
 * Conversion notes (decision 6 — each drop names what the mechanism was for):
 * - The oracle's sync/async door split (`embed_intent` / `aembed_intent`)
 *   existed because Python has two call flavors. TS is async-only, so both
 *   doors here are async; what survives is the PLANE split the flavors
 *   carried — `embedIntent` keeps the ingest posture (patient, 429 retried),
 *   `aembedIntent` keeps the read posture (fail-fast, never 429). The oracle
 *   names are kept for greppability against the Python.
 * - The legacy string-shim doors (`embed()`/`aembed()` with `task_type`, the
 *   `RawTaskTypeProvider` capability, the per-api-key default-adapter memos)
 *   existed for pre-seam Python callers; no TS caller predates the seam, so
 *   they are not ported. The production planes were already intent-native.
 * - The per-provider door memo (id-keyed, weakref-finalized) existed to
 *   amortize tenacity policy-object construction and to keep the memo from
 *   pinning its key; a plain retry loop has neither cost, so the doors here
 *   are built per call from the provider instance's own predicates — the
 *   live adapter still classifies its own errors.
 */

// ---------------------------------------------------------------------------
// The provider seam (oracle lib/provider.py, structural protocols → TS
// interfaces). The persisted identity of an embedding space is `modelId` +
// the column dimension — never the vendor; `providerId` is a registry name
// only: never persisted, never compared, never in the carry-forward skip-gate.

/** The two asymmetric embed intents every vendor has a vocabulary for
 * (Gemini `task_type`, Cohere/Voyage `input_type`); the vendor's literal
 * label stays inside the adapter. */
export type Intent = "document" | "query";

/** One embedding space, reachable through one vendor transport. */
export interface EmbeddingProvider {
  /** Registry/transport name ("gemini") — NEVER persisted, never in the skip-gate. */
  readonly providerId: string;
  /** THE persisted identity (sources/chunks/rlog + carry-forward), e.g. "gemini-embedding-001". */
  readonly modelId: string;
  /** Must equal the corpus's vector(N) column (enforced there; guarded at boot). */
  readonly dim: number;
  /** The recipe/provenance string, e.g. "RETRIEVAL_DOCUMENT". */
  readonly documentTaskLabel: string;
  /** The query cache-key string, e.g. "RETRIEVAL_QUERY". */
  readonly queryTaskLabel: string;
  /** `${modelId}/d${dim}/${documentTaskLabel}` — byte-equals config EMBED_RECIPE for the shipped space. */
  readonly recipe: string;
  /** Batch embed. Returns RAW vendor vectors, one per input; RAISES on any failure.
   * (Oracle had sync `embed` + async `aembed`; TS is async-only — the plane
   * split lives in the framework doors' retry policies, not in call flavor.) */
  embed(texts: readonly string[], opts: { intent: Intent }): Promise<number[][]>;
  /** The INGEST plane's classification — patient; MAY count a rate limit (429) as retryable. */
  isRetryable(exc: unknown): boolean;
  /** The READ plane's classification — fail-fast; MUST NOT count a rate limit as retryable. */
  isRetryableQuery(exc: unknown): boolean;
  /** DROP the stale client reference so the next call builds a fresh one. NEVER
   * close an in-flight client: concurrent callers keep their references and finish. */
  reset(): void;
}

/**
 * Build-plane text synthesis (calibration query generation, gold-gen, the
 * relevance judge). Deliberately separate from EmbeddingProvider — an
 * embed-only vendor is a full citizen. Port note: the oracle's protocol
 * carried only `generate`; `isRetryable`/`reset` were duck-typed off the
 * Gemini class by the retry door — here they are part of the interface so the
 * framework stays vendor-blind without duck probing.
 */
export interface TextGenerator {
  generate(prompt: string, opts?: { maxOutputTokens?: number }): Promise<string>;
  isRetryable(exc: unknown): boolean;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Env knobs come from the platform package — their permanent home.
import { envFloat, envInt } from "../env.js";

export { envFloat, envInt };

export const EMBED_TIMEOUT_S: number = envFloat("KSOR_EMBED_TIMEOUT_S", 60.0, 1.0);
/** Oracle env var: SOR_QUERY_EMBED_TIMEOUT_S. Note: query-embed.ts reads the
 * SAME variable with a different default (5.0) as its hard wall clock — two
 * deliberate reads, carried from the oracle (embedding.py:62 vs query_embed.py:44). */
export const QUERY_EMBED_TIMEOUT_S: number = envFloat("KSOR_QUERY_EMBED_TIMEOUT_S", 10.0, 1.0);

// ---------------------------------------------------------------------------
// Pure helpers (eval-locked; the embed_input recipe won the bake-off —
// queries embed PLAIN, never through this).

/** The text we embed for a chunk: the readable hierarchical heading path, then the content. */
export function embedInput(title: string, headingPath: string, content: string): string {
  const path = headingPath
    ? (title ? title + " > " : "") + headingPath.replaceAll("/", " > ").replaceAll("-", " ").trim()
    : title;
  return path ? `${path}\n\n${content}` : content;
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

function rejectDegenerate(vecs: readonly (readonly number[])[]): void {
  for (const v of vecs) {
    if (v.length === 0 || !v.some((x) => x !== 0) || !v.every((x) => Number.isFinite(x))) {
      throw new Error("degenerate embedding (empty / all-zero / non-finite)");
    }
  }
}

/** The pgvector-cosine contract, applied to whatever the transport returned. */
function contract(
  texts: readonly string[],
  raw: readonly (readonly number[])[],
  dim: number,
): number[][] {
  if (raw.length !== texts.length) {
    throw new Error(`embedding count mismatch: sent ${texts.length}, got ${raw.length}`);
  }
  // Dimension is part of the contract: a provider that ignores
  // outputDimensionality returns wrong-width vectors that would otherwise
  // surface as a pgvector error deep in a query (a 500 the search degrade
  // never catches) or, on ingest, only after the whole batch is paid for
  // (review finding #9, 2026-08-19). Reject at the boundary, before the DB.
  for (const v of raw) {
    if (v.length !== dim) {
      throw new Error(
        `embedding dimension mismatch: the declared space is d${dim}, the provider returned d${v.length}`,
      );
    }
  }
  const vecs = raw.map((v) => l2Normalize([...v]));
  rejectDegenerate(vecs);
  return vecs;
}

/** A pgvector literal — the one wire format for vector params (8 decimal places). */
export function vlit(vec: readonly number[]): string {
  return "[" + vec.map((x) => x.toFixed(8)).join(",") + "]";
}

// ---------------------------------------------------------------------------
// The two retry POLICIES are framework-owned (every adapter inherits the
// measured #148-era posture); the PREDICATES and the stale-client reset come
// from the provider instance.

interface RetryPolicy {
  readonly attempts: number;
  readonly initialS: number;
  readonly maxS: number;
}

/** Patient: 5 attempts, exp jitter 1..30 s, 429 included — batch work is resumable, nobody waits. */
const INGEST_RETRY: RetryPolicy = { attempts: 5, initialS: 1.0, maxS: 30.0 };
/** Fail-fast for the query path: 2 attempts, sub-second backoff, no 429 retry — worst case a
 * query embed costs ~1 s before the caller degrades, never a 15 s stall on the read. */
const QUERY_RETRY: RetryPolicy = { attempts: 2, initialS: 0.2, maxS: 0.5 };

function sleepS(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// tenacity wait_exponential_jitter, carried: min(initial * 2^n + uniform(0,1), max).
function expJitterS(policy: RetryPolicy, attemptIndex: number): number {
  return Math.min(policy.initialS * 2 ** attemptIndex + Math.random(), policy.maxS);
}

async function withRetry<T>(
  policy: RetryPolicy,
  isRetryable: (exc: unknown) => boolean,
  reset: () => void,
  attempt: () => Promise<T>,
): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (exc) {
      if (n + 1 >= policy.attempts || !isRetryable(exc)) throw exc; // reraise the ORIGINAL error
      reset(); // before-sleep: drop the stale client so the next attempt rebuilds
      await sleepS(expJitterS(policy, n));
    }
  }
}

// ---------------------------------------------------------------------------
// The intent-native doors — what the two production planes call (query-embed /
// ingest embed batch). No task_type string is ever consulted; the intent goes
// to the adapter as given, so a provider whose two vendor labels are equal
// can never mis-route a plane.

/**
 * The INGEST plane's door (intent "document"): every vector L2-re-normalized;
 * degenerates and count mismatches REFUSED. Patient retry (5 attempts, exp
 * jitter, 429 included) driven by the provider's own `isRetryable`.
 */
export async function embedIntent(
  texts: readonly string[],
  opts: { provider: EmbeddingProvider; intent: Intent },
): Promise<number[][]> {
  const { provider, intent } = opts;
  const raw = await withRetry(
    INGEST_RETRY,
    (exc) => provider.isRetryable(exc),
    () => provider.reset(),
    () => provider.embed(texts, { intent }),
  );
  return contract(texts, raw, provider.dim);
}

/**
 * The READ plane's door (query-embed, intent "query"). Same contract;
 * FAIL-FAST retry (no 429, 2 attempts): a rate limit degrades the search to
 * keyword-only in under a second instead of stalling the read ~15 s. Async
 * like everything here — the oracle's `a` prefix marked Python's async
 * flavor and is kept only for greppability against the Python.
 */
export async function aembedIntent(
  texts: readonly string[],
  opts: { provider: EmbeddingProvider; intent: Intent },
): Promise<number[][]> {
  const { provider, intent } = opts;
  const raw = await withRetry(
    QUERY_RETRY,
    (exc) => provider.isRetryableQuery(exc),
    () => provider.reset(),
    () => provider.embed(texts, { intent }),
  );
  return contract(texts, raw, provider.dim);
}

/**
 * BUILD-PLANE text generation (calibration query synthesis) — never a runtime
 * path; the ingest plane's patient retry. Port note: the oracle's legacy door
 * memoized a default Gemini generator per (model, api_key); here the
 * composition root constructs the generator and passes it (no cache, per the
 * conversion instruction — one or two callers per process earn no memo).
 */
export async function generateText(
  prompt: string,
  opts: { generator: TextGenerator; maxOutputTokens?: number },
): Promise<string> {
  const { generator, maxOutputTokens = 64 } = opts;
  return withRetry(
    INGEST_RETRY,
    (exc) => generator.isRetryable(exc),
    () => generator.reset(),
    () => generator.generate(prompt, { maxOutputTokens }),
  );
}
