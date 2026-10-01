/**
 * The OrcaRouter transport — the ONE place the relay is spoken to.
 *
 * It is a separate adapter from `providers/openai.ts` even though the wire
 * format is the same, for two reasons that are not stylistic:
 *
 * 1. **The credential is resolved per call, asynchronously.** OrcaRouter's key
 *    can arrive from a pasted value or from a browser authorization, and the
 *    seam that hides which (`credential.ts`) is async because one of its
 *    adapters waits on a human. An adapter built around a `const apiKey`
 *    string cannot sit behind that seam.
 * 2. **`401` means something specific here.** For a plain OpenAI key it is a
 *    bad key; for OrcaRouter it is the terminal revocation of a durable grant,
 *    and it must carry the account and generation that made the request so the
 *    caller can mark exactly that credential for reauthentication.
 *
 * Everything else follows the same discipline as the other transports in this
 * directory: raw vectors and raw text out, failures RAISED, normalization and
 * retry classification left to the framework.
 */

import type { EmbeddingProvider, Intent, TextGenerator } from "../embedding.js";
import { chatCompletionsUrl } from "./endpoints.js";
import type { OrcaCredential } from "./credential.js";
import { redact, scrubSecrets } from "./pkce.js";

/** Resolve a credential at call time. Built from either adapter, or from the `.env` store. */
export type OrcaCredentialResolver = () => Promise<OrcaCredential>;

/** The `error.type` a relay error body carries, when it sends one. */
export interface OrcaErrorBody {
  readonly message: string;
  readonly type: string | null;
  readonly code: string | null;
}

export class OrcaHttpError extends Error {
  readonly status: number;
  readonly body: OrcaErrorBody;

  constructor(status: number, body: OrcaErrorBody) {
    // The vendor's message only. A response body is external text and could in
    // principle quote the request, so the request is never echoed back here.
    super(`OrcaRouter error ${status}: ${body.message}`);
    this.name = "OrcaHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * A `401` — the credential is terminal. Carries the exact account and
 * generation that made the rejected request, which is what makes the recovery
 * generation-safe: a late failure from an old request can be recognised as
 * stale and refused permission to mark a newly-authorized credential broken.
 */
export class OrcaUnauthorizedError extends OrcaHttpError {
  readonly userId: string | null;
  readonly generation: number;

  constructor(body: OrcaErrorBody, credential: OrcaCredential) {
    super(401, body);
    this.name = "OrcaUnauthorizedError";
    this.userId = credential.userId;
    this.generation = credential.generation;
  }
}

/** The account is out of credit: waiting does not resolve it, and neither does a retry. */
export const PERMANENT_QUOTA = "insufficient_quota";

/**
 * External text becomes an error message HERE and nowhere else, which is why
 * `scrubSecrets` is applied on both arms: a gateway that quotes the rejected
 * `Authorization` header back would otherwise put the user's live key into our
 * terminal output, our logs and any crash report.
 */
function parseErrorBody(status: number, text: string): OrcaErrorBody {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const err = (parsed.error ?? parsed) as { message?: unknown; type?: unknown; code?: unknown };
    return {
      message: scrubSecrets(
        typeof err.message === "string" && err.message !== "" ? err.message : `HTTP ${status}`,
      ),
      type: typeof err.type === "string" ? err.type : null,
      code: typeof err.code === "string" ? err.code : null,
    };
  } catch {
    // Not JSON — the truncated body is the best detail available, and it is
    // external text, never the request.
    return { message: scrubSecrets(text.slice(0, 300)), type: null, code: null };
  }
}

function isTransportBlip(exc: unknown, depth = 0): boolean {
  if (depth > 5 || !(exc instanceof Error)) return false;
  if (exc.name === "AbortError" || exc.name === "TimeoutError") return true;
  const code = (exc as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENOTFOUND"].includes(
    code,
  );
}

function statusOf(exc: unknown): number | undefined {
  return exc instanceof OrcaHttpError ? exc.status : undefined;
}

/** The INGEST plane: transport blips, 5xx and 429 are retryable — batch work has nobody waiting. */
export function isRetryable(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  // A 401 is terminal by definition: the credential will not become valid by
  // being presented again. Retrying it is the "loop forever on 401" failure.
  if (exc instanceof OrcaUnauthorizedError) return false;
  if (exc instanceof OrcaHttpError && exc.body.type === PERMANENT_QUOTA) return false;
  const status = statusOf(exc);
  if (status === undefined) return false;
  return (status >= 500 && status <= 599) || status === 429;
}

/** The READ plane: never 429 — a rate-limited project stays rate-limited next second. */
export function isRetryableQuery(exc: unknown): boolean {
  if (isTransportBlip(exc)) return true;
  if (exc instanceof OrcaUnauthorizedError) return false;
  const status = statusOf(exc);
  return status !== undefined && status >= 500 && status <= 599;
}

/** An ACCOUNT-level failure: the drain aborts on it instead of quarantining chunks. */
export function isFatal(exc: unknown): boolean {
  if (exc instanceof OrcaUnauthorizedError) return true;
  return exc instanceof OrcaHttpError && exc.body.type === PERMANENT_QUOTA;
}

interface RequestOptions {
  readonly resolver: OrcaCredentialResolver;
  readonly fetchImpl?: typeof fetch;
  /** Called with the credential that made a rejected request, before the throw. */
  readonly onUnauthorized?: (credential: OrcaCredential) => void;
}

async function postJson(
  url: string,
  body: unknown,
  opts: RequestOptions & { timeoutMs: number },
): Promise<unknown> {
  const credential = await opts.resolver();
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      // The key rides a HEADER, never a query string — a URL is logged by every
      // proxy between here and the relay.
      headers: { authorization: `Bearer ${credential.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (exc) {
    // Wrap so the transport failures are classifiable; the message is the
    // transport's own and never contains the header we sent.
    const wrapped = new OrcaHttpError(0, {
      message: `could not reach ${url}: ${exc instanceof Error ? exc.name : "unknown"}`,
      type: null,
      code: null,
    });
    wrapped.name = "OrcaTransportError";
    throw wrapped;
  }
  const text = await res.text();
  if (!res.ok) {
    const parsed = parseErrorBody(res.status, text);
    if (res.status === 401) {
      const err = new OrcaUnauthorizedError(parsed, credential);
      opts.onUnauthorized?.(credential);
      throw err;
    }
    throw new OrcaHttpError(res.status, parsed);
  }
  return JSON.parse(text) as unknown;
}

// ---------------------------------------------------------------------------

export interface OrcaRouterEmbedOptions {
  readonly resolver: OrcaCredentialResolver;
  readonly apiBase: string;
  readonly modelId: string;
  readonly dim: number;
  readonly documentTaskLabel: string;
  readonly queryTaskLabel: string;
  readonly documentTimeoutS: number;
  readonly queryTimeoutS: number;
  readonly fetchImpl?: typeof fetch;
  readonly onUnauthorized?: (credential: OrcaCredential) => void;
}

/**
 * OrcaRouter's embedding transport. SYMMETRIC, like every OpenAI-wire vendor:
 * there is no task type, so both labels are empty and the intent is
 * deliberately ignored — the case `lib/embedding.ts` names as the one that
 * cannot mis-route a plane.
 */
export class OrcaRouterEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string = "orcarouter";
  readonly modelId: string;
  readonly dim: number;
  readonly documentTaskLabel: string;
  readonly queryTaskLabel: string;
  private readonly opts: OrcaRouterEmbedOptions;

  constructor(opts: OrcaRouterEmbedOptions) {
    this.opts = opts;
    this.modelId = opts.modelId;
    this.dim = opts.dim;
    this.documentTaskLabel = opts.documentTaskLabel;
    this.queryTaskLabel = opts.queryTaskLabel;
  }

  get recipe(): string {
    return `${this.modelId}/d${this.dim}/${this.documentTaskLabel}`;
  }

  /** Nothing is cached between calls (the credential is resolved per call), so this is a no-op. */
  reset(): void {
    /* no client to drop */
  }

  async embed(texts: readonly string[], opts: { intent: Intent }): Promise<number[][]> {
    const json = (await postJson(
      `${this.opts.apiBase}/embeddings`,
      { model: this.modelId, input: [...texts], dimensions: this.dim },
      {
        resolver: this.opts.resolver,
        timeoutMs: Math.trunc(
          (opts.intent === "document" ? this.opts.documentTimeoutS : this.opts.queryTimeoutS) *
            1000,
        ),
        ...(this.opts.fetchImpl === undefined ? {} : { fetchImpl: this.opts.fetchImpl }),
        ...(this.opts.onUnauthorized === undefined
          ? {}
          : { onUnauthorized: this.opts.onUnauthorized }),
      },
    )) as { data?: ReadonlyArray<{ embedding?: number[]; index?: number }> };
    const data = [...(json.data ?? [])];
    // Order is not promised by field order; every item carries its own `index`
    // and the framework pairs vectors to texts positionally.
    data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return data.map((d) => [...(d.embedding ?? [])]);
  }

  isRetryable(exc: unknown): boolean {
    return isRetryable(exc);
  }

  isRetryableQuery(exc: unknown): boolean {
    return isRetryableQuery(exc);
  }

  isFatal(exc: unknown): boolean {
    return isFatal(exc);
  }
}

export interface OrcaRouterTextOptions {
  readonly resolver: OrcaCredentialResolver;
  readonly apiBase: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly onUnauthorized?: (credential: OrcaCredential) => void;
  readonly timeoutMs?: number;
}

/**
 * The default synthesis model. Movable cheaply — it writes only calibration
 * probes, so a change alters future measurements and invalidates nothing
 * stored.
 *
 * A `vendor/model` id, chosen because it is a model that exists in the
 * catalog's own namespace rather than one of the gateway's routing aliases.
 * The DEFAULT is overridable at construction; `ksor calibrate` does not pass
 * one, so an operator on a key scoped away from this model sets
 * `embedding.provider: orcarouter`'s sibling text choice by editing the
 * generator's `model` — the same "declare it in the record" posture the
 * embedding model already has.
 */
export const DEFAULT_TEXT_MODEL = "deepseek/deepseek-v4-pro";

/**
 * BUILD-PLANE text generation over the relay's OpenAI-compatible
 * `/chat/completions`. Temperature 0, because it writes probe questions the
 * calibration door measures against and a sampled question would make two
 * measurements of the same corpus incomparable.
 */
export class OrcaRouterTextGenerator implements TextGenerator {
  readonly model: string;
  private readonly opts: OrcaRouterTextOptions;

  constructor(opts: OrcaRouterTextOptions) {
    this.opts = opts;
    this.model = opts.model ?? DEFAULT_TEXT_MODEL;
  }

  reset(): void {
    /* no client to drop */
  }

  async generate(prompt: string, opts?: { maxOutputTokens?: number }): Promise<string> {
    const json = (await postJson(
      chatCompletionsUrl(this.opts.apiBase),
      {
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: opts?.maxOutputTokens ?? 64,
      },
      {
        resolver: this.opts.resolver,
        timeoutMs: this.opts.timeoutMs ?? 60_000,
        ...(this.opts.fetchImpl === undefined ? {} : { fetchImpl: this.opts.fetchImpl }),
        ...(this.opts.onUnauthorized === undefined
          ? {}
          : { onUnauthorized: this.opts.onUnauthorized }),
      },
    )) as { choices?: ReadonlyArray<{ message?: { content?: unknown } }> };
    const content = json.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  }

  isRetryable(exc: unknown): boolean {
    return isRetryable(exc);
  }
}

/** What a log or an error may say about the credential in use. Never the key. */
export function describeCredential(credential: OrcaCredential): string {
  return `${credential.source} ${redact(credential.apiKey)}`;
}
