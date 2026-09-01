/**
 * OpenAI's embedding endpoint, over `fetch` — no SDK.
 *
 * The same call decision 12's 2026-08-22 revision made for Gemini, for the same
 * reason: this is ONE HTTP call behind a structurally-typed slice, and a vendor
 * SDK would put megabytes and a transitive dependency tree into every
 * `ksor init` that never embeds anything. If a provider ever needs an SDK, the
 * seam takes one through `clientFactory`; nothing here forecloses that.
 *
 * WHAT DIFFERS FROM GEMINI, and it is worth knowing before choosing:
 *
 *   Gemini embeds ASYMMETRICALLY — `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY`
 *   produce different vectors for the same text, and the plane's intent picks
 *   which. OpenAI has no task type: a query and a document are embedded
 *   identically. The seam anticipates exactly this — "a provider whose two
 *   vendor labels are equal can never mis-route a plane"
 *   (`lib/embedding.ts`) — so both labels are the empty string and the intent
 *   reaches this transport and is deliberately ignored.
 *
 *   `dimensions` is supported on `text-embedding-3-*` only. Asking an older
 *   model for a dimension is an error there, not a silent full-width vector,
 *   which is the failure the framework's own width check would catch anyway.
 */

/**
 * An HTTP-shaped failure carrying the status the retry classifier reads — and
 * the vendor's own error `type`, which the status alone does not distinguish.
 *
 * OpenAI answers a spent balance with **429**, the same status as a rate limit:
 * `{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}`
 * (observed live, 2026-09-01). One clears by waiting and one never will, so a
 * classifier reading only the status retries a billing problem five times with
 * exponential backoff and then reports it — slowly, and as if it had been
 * transient.
 */
export class OpenAiHttpError extends Error {
  readonly status: number;
  /** The vendor's `error.type`, when it sends one. */
  readonly kind: string | null;

  constructor(status: number, detail: string, kind: string | null = null) {
    super(`OpenAI API error ${status}: ${detail}`);
    this.name = "OpenAiHttpError";
    this.status = status;
    this.kind = kind;
  }
}

/** A 429 that no amount of waiting resolves: the balance, not the rate. */
export const PERMANENT_QUOTA = "insufficient_quota";

export interface OpenAiRestOptions {
  /** Injected in tests; defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to the public endpoint. */
  readonly baseUrl?: string;
}

/** The slice the provider consumes — the same shape the Gemini client presents. */
export interface OpenAiEmbedClient {
  embed(params: {
    model: string;
    input: readonly string[];
    dimensions: number;
    timeoutMs: number;
  }): Promise<{ embeddings: ReadonlyArray<{ values?: number[] }> }>;
}

const DEFAULT_BASE = "https://api.openai.com/v1";

export function openAiRestEmbedClient(
  apiKey: string,
  opts: OpenAiRestOptions = {},
): OpenAiEmbedClient {
  return {
    async embed(params) {
      const doFetch = opts.fetchImpl ?? fetch;
      const res = await doFetch(`${opts.baseUrl ?? DEFAULT_BASE}/embeddings`, {
        method: "POST",
        // The key in a HEADER, never a query string, which is logged.
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: params.model,
          input: [...params.input],
          dimensions: params.dimensions,
        }),
        signal: AbortSignal.timeout(params.timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        // The vendor's own message when it sends one; the raw body when it does not.
        let detail = text.slice(0, 300);
        let kind: string | null = null;
        try {
          const err = (JSON.parse(text) as { error?: { message?: unknown; type?: unknown } }).error;
          if (typeof err?.message === "string") detail = err.message;
          if (typeof err?.type === "string") kind = err.type;
        } catch {
          /* not JSON — the truncated body is the best detail available */
        }
        throw new OpenAiHttpError(res.status, detail, kind);
      }
      const json = JSON.parse(text) as {
        data?: ReadonlyArray<{ embedding?: number[]; index?: number }>;
      };
      const data = [...(json.data ?? [])];
      // ORDER IS NOT PROMISED by the field order — every item carries its own
      // `index`, and the framework pairs vectors to texts positionally. Sorting
      // here is the difference between a correct embedding and a silently
      // shuffled one, which no width or degeneracy check would catch.
      data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return { embeddings: data.map((d) => ({ values: d.embedding })) };
    },
  };
}
