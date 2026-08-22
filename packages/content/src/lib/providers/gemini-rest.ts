/**
 * The Gemini transport, spoken directly.
 *
 * `@google/genai` was 17 MB installed (twice under pnpm, and inlined into every
 * `npx @panaversity/ksor init`) for exactly two HTTP calls that
 * `providers/gemini.ts` already wraps behind a structurally-typed client slice.
 * This module implements that slice with `fetch`, so the SDK stops being install
 * weight for every adopter — including the ones who never climb to a served rung
 * (issue #54, decision 12 revision).
 *
 * VERIFIED AGAINST THE LIVE API before a line of it was written, because the
 * whole question is whether a swap is safe:
 *
 *   - SDK and REST return **byte-identical** vectors for the same text, same
 *     model, same `outputDimensionality` and `taskType` — max per-component
 *     difference 0.000e+0 at 1536 dimensions. Neither normalises a truncated
 *     embedding, so every stored vector and every calibrated floor keeps its
 *     meaning. Had this differed by so much as a rounding step the swap would
 *     have silently invalidated `vector_floor` on every existing record.
 *   - `batchEmbedContents` takes one `requests[]` entry per text and answers
 *     `embeddings[]` in order.
 *   - `generateContent` takes `generationConfig`, and the reply's text is the
 *     concatenation of `candidates[0].content.parts[].text`.
 *   - The SDK throws an `Error` carrying a NUMERIC `status`. The retry
 *     classification in `gemini.ts` duck-types on exactly that, so this module
 *     must too — see `GeminiHttpError`.
 *
 * The base URL and `fetch` are injectable so tests assert the request we build
 * and the response we parse without touching the network. The one live call
 * stays where it was: `gemini.live.db.test.ts`, the tripwire for vendor drift.
 */

import type { GeminiEmbedClient, GeminiTextClient } from "./gemini.js";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * An HTTP-shaped failure carrying the status the retry classifier reads.
 *
 * `isRetryable` in `gemini.ts` asks for a numeric `status` and nothing else, by
 * design — it was written to survive SDK refactors. This keeps that contract
 * when the SDK is gone.
 */
export class GeminiHttpError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Gemini API error ${status}: ${detail}`);
    this.name = "GeminiHttpError";
    this.status = status;
  }
}

export interface GeminiRestOptions {
  /** Injected in tests; defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to the public endpoint. */
  readonly baseUrl?: string;
}

/** One POST, with the key in a HEADER — never the query string, which is logged. */
async function post(
  opts: GeminiRestOptions,
  apiKey: string,
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl ?? DEFAULT_BASE}${path}`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    // The vendor's own message when it sends one; the raw body when it does not.
    let detail = text.slice(0, 300);
    try {
      const parsed: unknown = JSON.parse(text);
      const message = (parsed as { error?: { message?: unknown } }).error?.message;
      if (typeof message === "string") detail = message;
    } catch {
      /* not JSON — the truncated body is the best detail available */
    }
    throw new GeminiHttpError(res.status, detail);
  }
  return JSON.parse(text) as unknown;
}

/** The embedding half of the slice, spoken over `batchEmbedContents`. */
export function geminiRestEmbedClient(
  apiKey: string,
  opts: GeminiRestOptions = {},
): GeminiEmbedClient {
  return {
    models: {
      async embedContent(params) {
        const payload = {
          requests: params.contents.map((text) => ({
            model: `models/${params.model}`,
            content: { parts: [{ text }] },
            taskType: params.config.taskType,
            outputDimensionality: params.config.outputDimensionality,
          })),
        };
        const json = await post(
          opts,
          apiKey,
          `/models/${params.model}:batchEmbedContents`,
          payload,
          params.config.httpOptions.timeout,
        );
        const embeddings = (json as { embeddings?: ReadonlyArray<{ values?: number[] }> })
          .embeddings;
        return { embeddings: embeddings ?? [] };
      },
    },
  };
}

/** The text half of the slice, spoken over `generateContent`. */
export function geminiRestTextClient(
  apiKey: string,
  opts: GeminiRestOptions = {},
): GeminiTextClient {
  return {
    models: {
      async generateContent(params) {
        const payload = {
          contents: [{ parts: [{ text: params.contents }] }],
          generationConfig: {
            temperature: params.config.temperature,
            maxOutputTokens: params.config.maxOutputTokens,
            thinkingConfig: params.config.thinkingConfig,
          },
        };
        const json = await post(
          opts,
          apiKey,
          `/models/${params.model}:generateContent`,
          payload,
          // The text plane has no per-call timeout in the slice; the oracle's
          // build-plane patience is the right default and the caller retries.
          120_000,
        );
        const parts =
          (
            json as {
              candidates?: ReadonlyArray<{
                content?: { parts?: ReadonlyArray<{ text?: string }> };
              }>;
            }
          ).candidates?.[0]?.content?.parts ?? [];
        return { text: parts.map((p) => p.text ?? "").join("") };
      },
    },
  };
}
