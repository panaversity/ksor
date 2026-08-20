/**
 * The resumable embed worker — converted from the oracle (sor-agentfactory @
 * b554f91, sor_content/ingest/worker.py), generation-scoped.
 *
 * The three quarried rules, carried: read the WHOLE pending set once on a
 * short connection; embed each batch holding NO connection; write each batch
 * through a short transaction (commit per batch — a re-run touches only what
 * is still pending). Failures: a RETRYABLE batch error aborts the run loudly
 * (chunks stay pending — never mass-quarantine on a provider blip); a
 * non-transient error BINARY-SPLITS down to the single poison chunk, which
 * quarantines as `failed` with its reason.
 */

import { embedInput } from "../lib/embedding.js";

export const BATCH: number = 32;

/** (chunk_id, embed input text) — the queue element, as in the oracle. */
export type PendingRow = readonly [chunkId: string, input: string];

/** $1 = tenant_id, $2 = generation. Deterministic queue order. */
export function buildPendingSql(): string {
  return `
        SELECT c.chunk_id::text, c.content, COALESCE(c.heading_path_text, ''), n.title
        FROM chunks c
        JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                      AND s.generation = c.generation
        JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
        WHERE c.tenant_id = $1 AND c.generation = $2 AND c.embedding_status = 'pending'
        ORDER BY c.source_id, c.ordinal
    `;
}

/** Rows as selected by buildPendingSql (array row mode): chunk_id, content, hpt, title. */
export function rowsToInputs(
  rows: readonly (readonly [string, string, string, string])[],
): PendingRow[] {
  return rows.map(([chunkId, content, hpt, title]): PendingRow => [
    chunkId,
    embedInput(title, hpt, content),
  ]);
}

/** $1 = pgvector literal, $2 = embedding_model, $3 = chunk_id. */
export const WRITE_SQL: string =
  "UPDATE chunks SET embedding = $1::vector, embedding_status = 'embedded'," +
  " embedded_at = now(), embedding_model = $2, embed_error = NULL WHERE chunk_id = $3::uuid";
/** $1 = reason (≤500 code points), $2 = chunk_id. */
export const FAIL_SQL: string =
  "UPDATE chunks SET embedding_status = 'failed', embed_error = $1 WHERE chunk_id = $2::uuid";

/** The split policy, factored pure: front half first, ORDER PRESERVED. */
export function binarySplit<T>(batch: readonly T[]): readonly [readonly T[], readonly T[]] {
  const mid = Math.floor(batch.length / 2);
  return [batch.slice(0, mid), batch.slice(mid)];
}

/** Python `str(exc)[:500]` parity: the message, truncated by CODE POINT. */
export function failureReason(exc: unknown): string {
  const message = exc instanceof Error ? exc.message : String(exc);
  return [...message].slice(0, 500).join("");
}

export interface DrainIo {
  /** Embeds one batch; returns pgvector literals, one per input; RAISES on failure. */
  readonly embedBatch: (texts: readonly string[]) => Promise<readonly string[]>;
  /** Commits one batch of (literal, chunk_id) writes in its own short transaction. */
  readonly writeBatch: (
    rows: readonly (readonly [literal: string, chunkId: string])[],
  ) => Promise<void>;
  /** Quarantines one poison chunk in its own transaction. */
  readonly markFailed: (reason: string, chunkId: string) => Promise<void>;
  /** The ingest plane's PATIENT taxonomy (429 = retry) — the provider's own classifier. */
  readonly isRetryable: (exc: unknown) => boolean;
}

export interface DrainResult {
  readonly embedded: number;
  readonly failed: number;
}

/**
 * Drain the queue in batches of BATCH, sequentially — one batch in flight at
 * a time, no parallel fan-out anywhere. The I/O is injected, so this function
 * owns ONLY the resume/isolate policy and tests without a provider.
 */
export async function drain(pending: readonly PendingRow[], io: DrainIo): Promise<DrainResult> {
  let embedded = 0;
  let failed = 0;
  const queue: (readonly PendingRow[])[] = [];
  for (let i = 0; i < pending.length; i += BATCH) queue.push(pending.slice(i, i + BATCH));
  while (queue.length > 0) {
    const batch = queue.shift()!;
    let literals: readonly string[];
    try {
      literals = await io.embedBatch(batch.map(([, text]) => text));
    } catch (exc) {
      if (io.isRetryable(exc)) throw exc; // abort the RUN; everything unwritten stays pending (resume = rerun)
      if (batch.length === 1) {
        await io.markFailed(failureReason(exc), batch[0]![0]);
        failed += 1;
        continue;
      }
      const [front, back] = binarySplit(batch);
      queue.unshift(front, back);
      continue;
    }
    if (literals.length !== batch.length) {
      // zip(strict=True) parity — a miscounting embed door is a bug, never a quiet drop.
      throw new Error(
        `embed batch returned ${literals.length} literals for ${batch.length} chunks — refusing to zip them`,
      );
    }
    await io.writeBatch(
      batch.map(([chunkId], i): readonly [string, string] => [literals[i]!, chunkId]),
    );
    embedded += batch.length;
  }
  return { embedded, failed };
}
