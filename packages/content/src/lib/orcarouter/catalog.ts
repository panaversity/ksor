/**
 * The model catalog: what the user may actually pick, and what each entry can
 * actually do.
 *
 * `GET {apiBase}/models` is the ONLY authority. A hand-written list of a few
 * examples is not a catalog and this module never presents one as such — the
 * seed below exists solely for the cold start and the outage, it is small, and
 * every entry in it is labelled `source: "seed"` so a caller can say so out
 * loud. When live discovery succeeds its result is authoritative and the seed
 * is not mixed into it: an outage fallback that silently merges into the real
 * answer is worse than no fallback, because nobody can tell which models the
 * account can really reach.
 *
 * CAPABILITY FILTERING IS NOT COSMETIC. A selector that offers an embedding
 * model for chat, or a text-only model for an attachment, produces a request
 * that fails at the relay — and the user has no way to tell which of the two
 * things they picked was wrong. So each entry point filters on metadata the
 * catalog states, and an entry whose metadata does not SAY it supports a
 * modality is excluded rather than assumed (`fail closed`).
 */

import type { OrcaCredentialResolver } from "./transport.js";
import { modelsUrl } from "./endpoints.js";

/** What an entry point needs. The selector is recomputed whenever this changes. */
export type Capability = "chat" | "embedding" | "image" | "video" | "rerank";

/** A non-text modality a caller actually attaches. */
export type InputModality = "image" | "audio" | "video";

/**
 * Endpoint types that mean "this model answers a text chat request". Taken
 * from the catalog's own `supported_endpoint_types`.
 */
const CHAT_ENDPOINTS: readonly string[] = ["openai", "anthropic", "gemini", "openai-response"];
/** Endpoint types that are a DEDICATED non-text route, excluded from a text selector. */
const NON_TEXT_ENDPOINTS: readonly string[] = ["image-generation", "openai-video", "jina-rerank"];

export interface CatalogModel {
  /** The vendor/model namespace, verbatim. Never rewritten, never lowercased. */
  readonly id: string;
  readonly name: string;
  readonly contextLength: number | null;
  readonly maxCompletionTokens: number | null;
  /** `architecture.input_modalities`, verbatim. Empty = the catalog did not say. */
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  readonly endpointTypes: readonly string[];
  /**
   * Reasoning effort levels, when a source states them. Present on the verified
   * seed; absent from live discovery, which does not advertise them — and an
   * absent ladder stays absent rather than being guessed from a model name.
   */
  readonly reasoningEfforts: readonly string[];
  readonly source: "live" | "seed";
}

export interface Catalog {
  readonly models: readonly CatalogModel[];
  /** `live` when the endpoint answered; `seed` when it did not. */
  readonly source: "live" | "seed";
  /** True when the catalog is the fallback rather than the account's real list. */
  readonly degraded: boolean;
  /** Why the fallback was used. Null on a live catalog. */
  readonly reason: string | null;
  /** How many records the endpoint sent before filtering. Live only. */
  readonly received: number;
}

/**
 * The cold-start / outage seed.
 *
 * Small ON PURPOSE. These are the models the integration spec names as the
 * verified fallback set, with the metadata that was verified for them — the
 * reasoning ladder on `openai/gpt-5.5` in particular, which a live response
 * does not carry and which would be lost by regenerating the seed from live
 * data. Losing it is the regression the spec calls out: restoring model NAMES
 * while dropping reasoning effort, context and modality metadata is easy to
 * miss when a test asserts IDs only.
 */
export const VERIFIED_SEED: readonly CatalogModel[] = [
  {
    id: "openai/gpt-5.5",
    name: "OpenAI: GPT-5.5",
    contextLength: 400_000,
    maxCompletionTokens: 128_000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    endpointTypes: ["openai", "openai-response"],
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    source: "seed",
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Anthropic: Claude Opus 4.8",
    contextLength: 200_000,
    maxCompletionTokens: 64_000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    endpointTypes: ["anthropic"],
    reasoningEfforts: [],
    source: "seed",
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Google: Gemini 3.5 Flash",
    contextLength: 1_000_000,
    maxCompletionTokens: 65_536,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    endpointTypes: ["gemini", "openai"],
    reasoningEfforts: [],
    source: "seed",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek: DeepSeek V4 Pro",
    contextLength: 1_048_576,
    maxCompletionTokens: 384_000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    endpointTypes: ["openai", "openai-response"],
    reasoningEfforts: ["low", "high", "max"],
    source: "seed",
  },
  {
    id: "orcarouter/auto",
    name: "OrcaRouter: Auto",
    contextLength: null,
    maxCompletionTokens: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    endpointTypes: ["openai", "openai-response", "anthropic", "gemini"],
    reasoningEfforts: [],
    source: "seed",
  },
];

/** Bounds, so a catalog response cannot consume unbounded memory or a hung socket. */
export const CATALOG_TIMEOUT_MS = 10_000;
export const CATALOG_MAX_BYTES = 2_000_000;
export const CATALOG_MAX_ITEMS = 2_000;

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

function asNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * One catalog record, or null when it does not have the shape this client can
 * speak. An entry with no id, or with an endpoint type we cannot call, is
 * DROPPED rather than repaired — the bounds clause of the spec is explicit
 * that a catalog must not be able to advertise routes the client cannot speak.
 */
export function parseModel(raw: unknown, source: "live" | "seed"): CatalogModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = record["id"];
  if (typeof id !== "string" || id === "") return null;
  const architecture = (record["architecture"] ?? {}) as Record<string, unknown>;
  const topProvider = (record["top_provider"] ?? {}) as Record<string, unknown>;
  const endpoints = asStringArray(record["supported_endpoint_types"]);
  // A live record that advertises NO endpoint type cannot be proven callable,
  // so it is not offered. (The seed carries its own types.)
  if (source === "live" && endpoints.length === 0) return null;
  return {
    id,
    name: typeof record["name"] === "string" && record["name"] !== "" ? record["name"] : id,
    contextLength: asNumber(record["context_length"]) ?? asNumber(topProvider["context_length"]),
    maxCompletionTokens:
      asNumber(record["max_completion_tokens"]) ?? asNumber(topProvider["max_completion_tokens"]),
    inputModalities: asStringArray(architecture["input_modalities"]),
    outputModalities: asStringArray(architecture["output_modalities"]),
    endpointTypes: endpoints,
    reasoningEfforts: [],
    source,
  };
}

/** The endpoint types a capability is allowed to be served over. */
function endpointMatches(model: CatalogModel, capability: Capability): boolean {
  switch (capability) {
    case "chat":
      // At least one text endpoint, AND not a dedicated non-text route.
      return (
        model.endpointTypes.some((t) => CHAT_ENDPOINTS.includes(t)) &&
        !model.endpointTypes.every((t) => NON_TEXT_ENDPOINTS.includes(t))
      );
    case "embedding":
      return model.endpointTypes.includes("embeddings");
    case "image":
      return model.endpointTypes.includes("image-generation");
    case "video":
      return model.endpointTypes.includes("openai-video");
    case "rerank":
      return model.endpointTypes.includes("jina-rerank");
  }
}

export interface FilterOptions {
  readonly capability: Capability;
  /**
   * The non-text modality this entry point actually sends. When set, the model
   * must DECLARE it in `architecture.input_modalities` — an entry that says
   * nothing is excluded, because "undeclared" is not "supported".
   */
  readonly inputModality?: InputModality;
}

/**
 * The options a selector is allowed to show. The one place capability rules
 * live, so a second entry point cannot invent a slightly different set.
 */
export function selectModels(models: readonly CatalogModel[], opts: FilterOptions): CatalogModel[] {
  return models.filter((model) => {
    if (!endpointMatches(model, opts.capability)) return false;
    if (opts.inputModality !== undefined) {
      // FAIL CLOSED. A chat model whose catalog record does not announce the
      // modality the user attached is not offered — guessing from a model name
      // is exactly what the spec forbids.
      if (!model.inputModalities.includes(opts.inputModality)) return false;
    }
    return true;
  });
}

/**
 * Whether a previously selected model is still one this selector may offer.
 * A caller uses this to CLEAR a stale selection rather than silently keep a
 * value that no longer matches — a selector showing model X while sending
 * model Y is the bug this prevents.
 */
export function stillCompatible(
  id: string,
  models: readonly CatalogModel[],
  opts: FilterOptions,
): boolean {
  return selectModels(models, opts).some((m) => m.id === id);
}

export interface DiscoverOptions {
  readonly apiBase: string;
  readonly resolver: OrcaCredentialResolver;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxItems?: number;
}

/**
 * Fetch the live catalog, falling back to the verified seed.
 *
 * WHAT A CATALOG ENTRY DOES NOT MEAN. `/v1/models` lists what the ACCOUNT can
 * reach; a key can be scoped NARROWER than the account, and the relay then
 * answers `403 block_key_scope` for a model its own catalog advertised
 * (observed live, 2026-09-15). So a catalog entry is a CANDIDATE, not a grant:
 * it is what makes an option offerable, and the relay is what decides. The
 * client's job is to fail with a named, classifiable error when a model turns
 * out not to be granted — not to hide models on a guess about which ones are.
 *
 *
 * The fallback is REPORTED, never silent: `degraded` and `reason` ride the
 * result so a UI can say "showing the built-in list; the live catalog did not
 * answer" and an operator can see why. A cold start that cannot reach the
 * catalog must not look like an account with nothing in it.
 */
export async function discoverCatalog(opts: DiscoverOptions): Promise<Catalog> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? CATALOG_MAX_BYTES;
  const maxItems = opts.maxItems ?? CATALOG_MAX_ITEMS;
  try {
    const credential = await opts.resolver();
    const res = await doFetch(modelsUrl(opts.apiBase), {
      method: "GET",
      headers: { authorization: `Bearer ${credential.apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? CATALOG_TIMEOUT_MS),
    });
    if (!res.ok) {
      return degraded(`the catalog answered ${res.status}`);
    }
    const text = await res.text();
    if (text.length > maxBytes) return degraded(`the catalog exceeded ${maxBytes} bytes`);
    const body = JSON.parse(text) as { data?: unknown };
    const raw = Array.isArray(body.data) ? body.data : [];
    const models = raw
      .slice(0, maxItems)
      .map((entry) => parseModel(entry, "live"))
      .filter((m): m is CatalogModel => m !== null);
    return { models, source: "live", degraded: false, reason: null, received: raw.length };
  } catch (exc) {
    // A network failure, a timeout, an unparseable body, a missing credential —
    // all of them mean the same thing to the caller: this is not the live list.
    return degraded(exc instanceof Error ? exc.name : "the catalog could not be read");
  }
}

function degraded(reason: string): Catalog {
  return {
    models: VERIFIED_SEED,
    source: "seed",
    degraded: true,
    reason,
    received: 0,
  };
}
