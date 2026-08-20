/**
 * The Gemini transport — the ONE place `@google/genai` is imported (converted
 * from the oracle's sor_content/lib/providers/gemini.py; decision 6).
 * Identity (model, dim, task labels) is CONSTRUCTOR-INJECTED — this module
 * never imports config, so the same adapter serves any Gemini embedding
 * model. The adapter returns RAW vectors and RAISES on failure.
 * Normalization, count check, degenerate rejection, and retry live in the
 * framework (embedding.ts) — never here.
 *
 * Port notes:
 * - The oracle imported `google.genai` lazily so a non-Gemini deployment
 *   never paid the vendor import; static ESM has no cheap equivalent without
 *   making every registry build async, so the import is static here. The
 *   property that MATTERS survives: the framework stays vendor-blind — only
 *   this module and the registry know Gemini exists.
 * - The oracle's sync/async doors bound timeouts by call FLAVOR (sync =
 *   ingest patience, async = read patience). TS has one async door, so the
 *   timeout follows the INTENT: document → the batch clock, query → the read
 *   clock. (The oracle's one divergence — a sync query-intent embed keeping
 *   the batch clock, an eval-harness case — has no TS call site.)
 * - The oracle's "has been closed" stale-client RuntimeError predicate is a
 *   Python-SDK failure mode with no @google/genai JS equivalent; `reset()`
 *   keeps its drop-never-close contract regardless.
 */

import { GoogleGenAI } from "@google/genai";
import type { EmbeddingProvider, Intent, TextGenerator } from "../embedding.js";

// The genai client SLICE the adapter touches, typed structurally so tests
// mock the client object (never the network) and the SDK stays wrapped at
// this one boundary. `GoogleGenAI` satisfies these by construction.
export interface GeminiEmbedClient {
  models: {
    embedContent(params: {
      model: string;
      contents: string[];
      config: {
        outputDimensionality: number;
        taskType: string;
        httpOptions: { timeout: number };
      };
    }): Promise<{ embeddings?: ReadonlyArray<{ values?: number[] }> }>;
  };
}

export interface GeminiTextClient {
  models: {
    generateContent(params: {
      model: string;
      contents: string;
      config: {
        temperature: number;
        maxOutputTokens: number;
        thinkingConfig: { thinkingBudget: number };
      };
    }): Promise<{ text?: string }>;
  };
}

// ---------------------------------------------------------------------------
// Exception taxonomy (module-level and stateless — importable without a
// client, like the oracle's). The oracle classified httpx.TransportError |
// genai ServerError | 429 ClientError; the JS equivalents are duck-typed by
// SHAPE (an HTTP-shaped error carrying a numeric `status`; fetch/undici
// transport failures) so the predicates survive SDK refactors.

function httpStatusOf(exc: unknown): number | undefined {
  if (!(exc instanceof Error)) return undefined;
  const status = (exc as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isTransportBlip(exc: unknown, depth = 0): boolean {
  if (depth > 5 || !(exc instanceof Error)) return false;
  // The SDK's per-request timeout aborts the fetch (#148 posture: a timeout
  // IS a transport blip — retryable on both planes, like httpx.TimeoutException).
  if (exc.name === "AbortError" || exc.name === "TimeoutError") return true;
  const code = (exc as { code?: unknown }).code;
  // Node syscall-level failures: ECONNRESET, ECONNREFUSED, ETIMEDOUT, EPIPE, EAI_AGAIN…
  if (typeof code === "string" && /^E[A-Z0-9_]+$/.test(code)) return true;
  // undici's network-failure shape: TypeError("fetch failed") wrapping the cause.
  if (exc instanceof TypeError && exc.message.includes("fetch failed")) return true;
  return isTransportBlip(exc.cause, depth + 1);
}

/** The Gemini taxonomy for the INGEST plane: transport blips, 5xx, AND 429 —
 * batch work is resumable and has no user waiting. */
export function isRetryable(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  const status = httpStatusOf(exc);
  if (status === undefined) return false;
  return (status >= 500 && status <= 599) || status === 429;
}

/** The READ path's predicate: transport blips + 5xx only — NEVER 429. A
 * rate-limited project stays rate-limited on the next second; the correct
 * move is to degrade to keyword-only NOW, not stall the read behind backoff. */
export function isRetryableQuery(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  const status = httpStatusOf(exc);
  return status !== undefined && status >= 500 && status <= 599;
}

// ---------------------------------------------------------------------------

export interface GeminiEmbeddingProviderOptions {
  modelId: string;
  dim: number;
  documentTaskLabel: string;
  queryTaskLabel: string;
  apiKey: string;
  documentTimeoutS: number;
  queryTimeoutS: number;
  /** Test seam / boundary wrap: defaults to building the real SDK client. */
  clientFactory?: () => GeminiEmbedClient;
}

/**
 * `gemini-embedding-001`-shaped transport for ANY Gemini embedding model:
 * `embedContent` with an asymmetric `taskType` and `outputDimensionality`.
 * The client is built lazily on first use and held as instance state.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string = "gemini";
  readonly modelId: string;
  readonly dim: number;
  readonly documentTaskLabel: string;
  readonly queryTaskLabel: string;
  private readonly documentTimeoutMs: number;
  private readonly queryTimeoutMs: number;
  private readonly clientFactory: () => GeminiEmbedClient;
  private client: GeminiEmbedClient | null = null;

  constructor(opts: GeminiEmbeddingProviderOptions) {
    this.modelId = opts.modelId;
    this.dim = opts.dim;
    this.documentTaskLabel = opts.documentTaskLabel;
    this.queryTaskLabel = opts.queryTaskLabel;
    // The adapter maps the framework's seconds knobs to its HTTP mechanism
    // (ms) — the ms form is the adapter's, never a second framework knob.
    this.documentTimeoutMs = Math.trunc(opts.documentTimeoutS * 1000);
    this.queryTimeoutMs = Math.trunc(opts.queryTimeoutS * 1000);
    this.clientFactory =
      opts.clientFactory ?? ((): GeminiEmbedClient => new GoogleGenAI({ apiKey: opts.apiKey }));
  }

  get recipe(): string {
    return `${this.modelId}/d${this.dim}/${this.documentTaskLabel}`;
  }

  private getClient(): GeminiEmbedClient {
    this.client ??= this.clientFactory();
    return this.client;
  }

  /** DROP the client reference, never close it: in-flight calls keep their
   * local reference and finish; the next call rebuilds lazily. Idempotent. */
  reset(): void {
    this.client = null;
  }

  async embed(texts: readonly string[], opts: { intent: Intent }): Promise<number[][]> {
    const client = this.getClient();
    const resp = await client.models.embedContent({
      model: this.modelId,
      contents: [...texts],
      config: {
        outputDimensionality: this.dim,
        taskType: opts.intent === "document" ? this.documentTaskLabel : this.queryTaskLabel,
        // Timeouts follow the PLANE the intent names: document = batch/ingest
        // patience, query = read patience (see the module port note).
        httpOptions: {
          timeout: opts.intent === "document" ? this.documentTimeoutMs : this.queryTimeoutMs,
        },
      },
    });
    return (resp.embeddings ?? []).map((e) => [...(e.values ?? [])]);
  }

  isRetryable(exc: unknown): boolean {
    return isRetryable(exc);
  }

  isRetryableQuery(exc: unknown): boolean {
    return isRetryableQuery(exc);
  }
}

// ---------------------------------------------------------------------------

export interface GeminiTextGeneratorOptions {
  apiKey: string;
  /** Default "gemini-2.5-flash" (the oracle's build-plane model). */
  model?: string;
  clientFactory?: () => GeminiTextClient;
}

/**
 * BUILD-PLANE text generation (calibration query synthesis) — never a runtime
 * path. The `generateContent` config is the quarried one: temperature 0,
 * thinking budget 0 (quarried: budget goes to TEXT).
 */
export class GeminiTextGenerator implements TextGenerator {
  readonly model: string;
  private readonly clientFactory: () => GeminiTextClient;
  private client: GeminiTextClient | null = null;

  constructor(opts: GeminiTextGeneratorOptions) {
    this.model = opts.model ?? "gemini-2.5-flash";
    this.clientFactory =
      opts.clientFactory ?? ((): GeminiTextClient => new GoogleGenAI({ apiKey: opts.apiKey }));
  }

  private getClient(): GeminiTextClient {
    this.client ??= this.clientFactory();
    return this.client;
  }

  reset(): void {
    this.client = null; // drop, never close — same lifecycle as the embedding adapter
  }

  async generate(prompt: string, opts?: { maxOutputTokens?: number }): Promise<string> {
    const resp = await this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.0,
        maxOutputTokens: opts?.maxOutputTokens ?? 64,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return resp.text ?? "";
  }

  isRetryable(exc: unknown): boolean {
    return isRetryable(exc);
  }
}
