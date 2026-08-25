/**
 * The embedding-provider registry — a plain object, NOT any discovery
 * mechanism (implicit cross-package discovery is exactly what this repo's
 * composition-as-code design forbids). A composition root extends the object
 * or passes a provider instance directly; an unknown name fails LOUD at boot.
 * Converted from the oracle's sor_content/lib/providers/__init__.py.
 *
 * `gemini` is the shipped transport; `fake` is a ksor addition (key-free,
 * deterministic — CI's provider; see fake.ts). `buildShippedProvider` is THE
 * ONE door every composition root builds through: registry name + key + the
 * DECLARED space, with the task labels and the framework's timeout knobs
 * bound internally so no caller spells a label or a knob. (The oracle's raw
 * `build_embedding_provider` door — every identity field explicit — served
 * tests and deliberate non-config identities; TS tests construct adapters
 * directly, so it is not ported.)
 */

import { EMBED_DIM, EMBED_MODEL, EMBED_TASK_DOCUMENT, EMBED_TASK_QUERY } from "../../config.js";
import { embedTimeoutS, queryEmbedTimeoutS } from "../embedding.js";
import type { EmbeddingProvider } from "../embedding.js";
import { FakeEmbeddingProvider } from "./fake.js";
import { GeminiEmbeddingProvider } from "./gemini.js";

export interface ProviderBuildOptions {
  apiKey: string;
  modelId: string;
  dim: number;
  documentTaskLabel: string;
  queryTaskLabel: string;
  documentTimeoutS: number;
  queryTimeoutS: number;
}

/** One registry row: how to build the adapter, and whether it needs an API
 * key at all (an in-process or IAM-authenticated transport does not — its
 * composition root then requires no GEMINI_API_KEY-shaped env). */
export interface ProviderEntry {
  build: (opts: ProviderBuildOptions) => EmbeddingProvider;
  needsApiKey: boolean;
}

/**
 * A key-needing provider was built without an API key. A TYPED error (mirrors
 * EmbeddingSpaceMismatch) so a composition root classifies the missing-key case
 * by TYPE, not by string-matching this message — the exact prose-coupling scar
 * read.ts:152 records (review, 2026-08-19). The message stays stable, but the
 * exit-code mapping no longer breaks when it is reworded.
 */
export class MissingProviderKeyError extends Error {
  readonly providerName: string;
  constructor(providerName: string) {
    super(
      `embedding provider ${JSON.stringify(providerName)} needs an API key and none was supplied`,
    );
    this.name = "MissingProviderKeyError";
    this.providerName = providerName;
  }
}

export const PROVIDERS: Record<string, ProviderEntry> = {
  gemini: {
    build: (opts: ProviderBuildOptions): EmbeddingProvider => new GeminiEmbeddingProvider(opts),
    needsApiKey: true,
  },
  // ksor addition: deterministic and key-free, so the DB tier and CI exercise
  // ingest + retrieval without a vendor key. Its model id is always
  // "fake-embed-001" (never the defaulted EMBED_MODEL — see fake.ts).
  fake: {
    build: (opts: ProviderBuildOptions): EmbeddingProvider => new FakeEmbeddingProvider(opts),
    needsApiKey: false,
  },
};

function entryFor(name: string): ProviderEntry {
  // Object.hasOwn, not a bare index: a name like "constructor" or
  // "toString" would otherwise resolve to a prototype member and bypass the
  // loud refusal (review, 2026-08-19).
  const entry = Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : undefined;
  if (entry === undefined) {
    throw new Error(
      `unknown embedding provider ${JSON.stringify(name)} — registered: ${Object.keys(PROVIDERS).sort().join(", ")}`,
    );
  }
  return entry;
}

/** Whether the named provider's factory needs an API key. Unknown name → the
 * same loud error as building it, so a composition root can ask this FIRST
 * and still fail on a typo. */
export function providerNeedsApiKey(name: string): boolean {
  return entryFor(name).needsApiKey;
}

/**
 * The port door: the named provider bound to the DECLARED embedding space and
 * the framework's timeout knobs. `modelId`/`dim` omitted = the shipped
 * config space (EMBED_MODEL / EMBED_DIM, eval-locked); an instance may
 * declare another and the composition root threads it through here. The task
 * labels stay config-bound (not an instance knob). `apiKey: null` is legal
 * only for a provider whose registry row says it needs none; a key-needing
 * provider without one is refused loudly HERE, never handed an empty string
 * to fail on the first embed.
 */
export function buildShippedProvider(
  name: string,
  opts: { apiKey: string | null; modelId?: string; dim?: number },
): EmbeddingProvider {
  const entry = entryFor(name);
  if (entry.needsApiKey && !opts.apiKey) {
    throw new MissingProviderKeyError(name);
  }
  return entry.build({
    apiKey: opts.apiKey ?? "",
    modelId: opts.modelId ?? EMBED_MODEL,
    dim: opts.dim ?? EMBED_DIM,
    documentTaskLabel: EMBED_TASK_DOCUMENT,
    queryTaskLabel: EMBED_TASK_QUERY,
    documentTimeoutS: embedTimeoutS(),
    queryTimeoutS: queryEmbedTimeoutS(),
  });
}
