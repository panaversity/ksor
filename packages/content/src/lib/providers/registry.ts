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
import { EMBED_TIMEOUT_S, QUERY_EMBED_TIMEOUT_S } from "../embedding.js";
import type { EmbeddingProvider } from "../embedding.js";
import { FakeEmbeddingProvider } from "./fake.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { OpenAiEmbeddingProvider } from "./openai.js";

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
  /**
   * The environment variable holding this provider's key, ASKED OF THE
   * REGISTRY rather than spelled in a composition root.
   *
   * `GEMINI_API_KEY` was written into three composition roots, so a second
   * provider could not obtain a key even though the registry would happily
   * build it — the wiring re-bound a seam that was vendor-neutral in shape
   * (issue #25). This is the pattern the record already uses one layer up:
   * `instance.md` names the DSN variable rather than hardcoding it.
   *
   * `null` for a provider that needs no key.
   */
  keyEnv: string | null;
  /**
   * The vendor's task labels, which belong to the PROVIDER and not to global
   * config. `buildShippedProvider` handed every provider Gemini's
   * `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`, so an OpenAI run logged its space
   * as `text-embedding-3-small/d1536/RETRIEVAL_DOCUMENT` — a task label that
   * vendor has no concept of and never received (caught by a live call,
   * 2026-09-01). The seam's guarantee is that "a provider whose two vendor
   * labels are equal can never mis-route a plane"; asserting a distinction for
   * a vendor that has none is the same defect from the other side.
   */
  taskLabels: { document: string; query: string };
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
    keyEnv: "GEMINI_API_KEY",
    taskLabels: { document: EMBED_TASK_DOCUMENT, query: EMBED_TASK_QUERY },
  },
  // The second real vendor, and the proof the seam holds: it needed no change
  // to `EmbeddingProvider`, to normalization, to the degeneracy check, or to
  // the persisted identity of a space (`modelId` + column width, never the
  // vendor). SYMMETRIC — no task type, so both labels are empty, the case
  // `lib/embedding.ts` anticipated. Switching to it is a re-embed of the whole
  // corpus and a re-measured floor: a different provider is a different space.
  openai: {
    build: (opts: ProviderBuildOptions): EmbeddingProvider => new OpenAiEmbeddingProvider(opts),
    needsApiKey: true,
    keyEnv: "OPENAI_API_KEY",
    // SYMMETRIC: no task type at all, so both labels are empty — the case
    // `lib/embedding.ts` names as the one that cannot mis-route a plane.
    taskLabels: { document: "", query: "" },
  },
  // ksor addition: deterministic and key-free, so the DB tier and CI exercise
  // ingest + retrieval without a vendor key. Its model id is always
  // "fake-embed-001" (never the defaulted EMBED_MODEL — see fake.ts).
  fake: {
    build: (opts: ProviderBuildOptions): EmbeddingProvider => new FakeEmbeddingProvider(opts),
    needsApiKey: false,
    keyEnv: null,
    taskLabels: { document: EMBED_TASK_DOCUMENT, query: EMBED_TASK_QUERY },
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
 * The environment variable this provider's key comes from, or null when it
 * needs none. Unknown name → the same loud error as building it.
 */
export function providerKeyEnv(name: string): string | null {
  return entryFor(name).keyEnv;
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
    documentTaskLabel: entry.taskLabels.document,
    queryTaskLabel: entry.taskLabels.query,
    documentTimeoutS: EMBED_TIMEOUT_S(),
    queryTimeoutS: QUERY_EMBED_TIMEOUT_S(),
  });
}
