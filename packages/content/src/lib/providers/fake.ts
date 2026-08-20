/**
 * The deterministic, key-free fake provider — a KSOR ADDITION (no oracle
 * counterpart; decision 6 conversion note). It exists so the DB tier and CI
 * can exercise ingest + retrieval end to end without a vendor key: same text
 * always embeds to the same vector, and a query embed of a document's exact
 * text lands at cosine 1.0 (the intent is deliberately NOT in the seed).
 *
 * Its model id is FIXED and clearly fake ("fake-embed-001") so a persisted
 * space produced by it can never be confused with a real one — the identity
 * is deliberately unconfigurable (a build option naming a real model would
 * let a fake space masquerade; the registry's default EMBED_MODEL is
 * therefore ignored here, see the constructor note).
 *
 * Like any adapter it returns RAW vectors (hash-derived, NOT normalized) and
 * lets the framework apply the contract — L2 normalization included — so the
 * fake exercises the exact code path the real provider does.
 */

import { createHash } from "node:crypto";
import type { EmbeddingProvider, Intent } from "../embedding.js";

export const FAKE_EMBED_MODEL = "fake-embed-001";

/**
 * A BAG-OF-TOKENS hash embedding: the vector is the sum of one seeded hash
 * direction per lowercased token. Shared tokens => correlated vectors, so
 * cosine behaves SEMANTICALLY enough for floors and abstention to be real
 * in tests ("zebra compensation" lands near a zebra document; "quantum
 * blockchain" lands nowhere) - while staying fully deterministic and
 * key-free. Non-degenerate by construction; never normalized here (the
 * framework's contract layer does that, same as any provider).
 */
function tokenDirection(token: string, modelId: string, dim: number): number[] {
  const out: number[] = [];
  for (let block = 0; out.length < dim; block++) {
    const digest = createHash("sha256").update(`${modelId} ${dim} ${block} ${token}`).digest();
    for (let off = 0; off + 4 <= digest.length && out.length < dim; off += 4) {
      out.push((digest.readUInt32BE(off) / 2 ** 32) * 2 - 1);
    }
  }
  return out;
}

function fakeVector(text: string, modelId: string, dim: number): number[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
  // A tiny seed direction so even a token-free text is non-degenerate.
  const out = tokenDirection("", modelId, dim).map((x) => x * 1e-6);
  for (const token of tokens) {
    const dir = tokenDirection(token, modelId, dim);
    for (let i = 0; i < dim; i += 1) out[i] = (out[i] ?? 0) + (dir[i] ?? 0);
  }
  return out;
}

export interface FakeEmbeddingProviderOptions {
  dim: number;
  documentTaskLabel: string;
  queryTaskLabel: string;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string = "fake";
  /** Fixed on purpose — see the module note; a registry build's modelId
   * option (defaulted to the real EMBED_MODEL) is deliberately not honored. */
  readonly modelId: string = FAKE_EMBED_MODEL;
  readonly dim: number;
  readonly documentTaskLabel: string;
  readonly queryTaskLabel: string;

  constructor(opts: FakeEmbeddingProviderOptions) {
    this.dim = opts.dim;
    this.documentTaskLabel = opts.documentTaskLabel;
    this.queryTaskLabel = opts.queryTaskLabel;
  }

  get recipe(): string {
    return `${this.modelId}/d${this.dim}/${this.documentTaskLabel}`;
  }

  embed(texts: readonly string[], _opts: { intent: Intent }): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => fakeVector(text, this.modelId, this.dim)));
  }

  /** Retryable-never: a fake failure is a test bug, not a transport blip. */
  isRetryable(_exc: unknown): boolean {
    return false;
  }

  isRetryableQuery(_exc: unknown): boolean {
    return false;
  }

  reset(): void {
    // no client to drop
  }
}
