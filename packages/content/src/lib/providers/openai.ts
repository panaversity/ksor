/**
 * The OpenAI embedding adapter — the second real vendor behind the seam.
 *
 * Issue #25: the seam is vendor-neutral in shape and was Gemini-bound in
 * wiring. This is the half that proves the shape holds, and it needed no
 * change to `EmbeddingProvider`, to the framework's normalization, to the
 * degeneracy check, or to the persisted identity of an embedding space —
 * which is `modelId` + column dimension and never the vendor.
 *
 * WHAT AN ADOPTER MUST KNOW BEFORE SWITCHING, because nothing here can soften
 * it: a different provider is a DIFFERENT EMBEDDING SPACE. Every stored vector
 * has to be re-embedded and every calibrated `vector_floor` re-measured — the
 * same argument decision 30 makes about moving between Gemini models, and the
 * product invariant that forbids copying a calibrated constant between corpora
 * applies across vendors with more force, not less. The schema records
 * `embedding_model` per generation, so a mismatch is caught rather than served.
 *
 * SYMMETRIC, unlike Gemini. There is no task type: a query and a document with
 * the same text embed to the same vector. Both task labels are therefore the
 * empty string, which is the case `lib/embedding.ts` already anticipated —
 * "a provider whose two vendor labels are equal can never mis-route a plane".
 * The intent still reaches this adapter, and still picks the TIMEOUT, because
 * that follows the plane rather than the vendor.
 */

import type { EmbeddingProvider, Intent } from "../embedding.js";
import {
  openAiRestEmbedClient,
  OpenAiHttpError,
  PERMANENT_QUOTA,
  type OpenAiEmbedClient,
} from "./openai-rest.js";

/** True for a transport blip with no HTTP status of its own. */
function isTransportBlip(exc: unknown): boolean {
  if (exc instanceof OpenAiHttpError) return false;
  const name = (exc as { name?: unknown } | null)?.name;
  return name === "AbortError" || name === "TimeoutError" || name === "TypeError";
}

function httpStatusOf(exc: unknown): number | undefined {
  return exc instanceof OpenAiHttpError ? exc.status : undefined;
}

/**
 * The INGEST plane's taxonomy: transport blips, 5xx, AND 429 — batch work is
 * resumable and has nobody waiting. Deliberately the same shape as the Gemini
 * adapter's, because the two planes are a property of ksor, not of a vendor.
 */
export function isRetryable(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  // A spent balance arrives as 429, the same status as a rate limit, and no
  // amount of patience resolves it. Retrying it costs five backoffs and then
  // reports a billing problem as though it had been transient (observed live
  // against a real key, 2026-09-01).
  if (exc instanceof OpenAiHttpError && exc.kind === PERMANENT_QUOTA) return false;
  const status = httpStatusOf(exc);
  if (status === undefined) return false;
  return (status >= 500 && status <= 599) || status === 429;
}

/**
 * The READ plane's: transport blips + 5xx only, NEVER 429. A rate-limited
 * project stays rate-limited on the next second, so a search degrades to
 * keyword-only now rather than stalling a reader behind backoff.
 */
export function isRetryableQuery(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  const status = httpStatusOf(exc);
  return status !== undefined && status >= 500 && status <= 599;
}

export interface OpenAiEmbeddingProviderOptions {
  modelId: string;
  dim: number;
  documentTaskLabel: string;
  queryTaskLabel: string;
  apiKey: string;
  documentTimeoutS: number;
  queryTimeoutS: number;
  /** Test seam / boundary wrap: defaults to building the real REST client. */
  clientFactory?: () => OpenAiEmbedClient;
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string = "openai";
  readonly modelId: string;
  readonly dim: number;
  readonly documentTaskLabel: string;
  readonly queryTaskLabel: string;
  private readonly documentTimeoutMs: number;
  private readonly queryTimeoutMs: number;
  private readonly clientFactory: () => OpenAiEmbedClient;
  private client: OpenAiEmbedClient | null = null;

  constructor(opts: OpenAiEmbeddingProviderOptions) {
    this.modelId = opts.modelId;
    this.dim = opts.dim;
    // Carried as given rather than forced empty: the registry supplies them,
    // and a provider that silently rewrote its own labels would make the
    // recipe below describe a space it did not use.
    this.documentTaskLabel = opts.documentTaskLabel;
    this.queryTaskLabel = opts.queryTaskLabel;
    this.documentTimeoutMs = Math.trunc(opts.documentTimeoutS * 1000);
    this.queryTimeoutMs = Math.trunc(opts.queryTimeoutS * 1000);
    this.clientFactory =
      opts.clientFactory ?? ((): OpenAiEmbedClient => openAiRestEmbedClient(opts.apiKey));
  }

  get recipe(): string {
    return `${this.modelId}/d${this.dim}/${this.documentTaskLabel}`;
  }

  private getClient(): OpenAiEmbedClient {
    this.client ??= this.clientFactory();
    return this.client;
  }

  /** DROP the client reference, never close it: in-flight calls finish on their
   * own reference and the next call rebuilds lazily. Idempotent. */
  reset(): void {
    this.client = null;
  }

  async embed(texts: readonly string[], opts: { intent: Intent }): Promise<number[][]> {
    const resp = await this.getClient().embed({
      model: this.modelId,
      input: texts,
      dimensions: this.dim,
      // The TIMEOUT follows the plane the intent names, exactly as it does for
      // Gemini — batch patience for a document, read patience for a query. The
      // task LABEL does not, because this vendor has none.
      timeoutMs: opts.intent === "document" ? this.documentTimeoutMs : this.queryTimeoutMs,
    });
    return resp.embeddings.map((e) => [...(e.values ?? [])]);
  }

  isRetryable(exc: unknown): boolean {
    return isRetryable(exc);
  }

  isRetryableQuery(exc: unknown): boolean {
    return isRetryableQuery(exc);
  }
}
