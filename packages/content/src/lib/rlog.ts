/**
 * The per-read audit writer (oracle SC/lib/rlog.py) — the §7 trail: every
 * serving act leaves a row proving it happened. Written synchronously
 * in-request (a background queue loses rows on scale-to-zero; co-located
 * with the database the write is ~one round trip), in its own short
 * transaction via runAudit — least-privilege runtime role, INSERT-only RLS,
 * exactly one attempt, ~1s checkout: under saturation the audit SHEDS. A
 * write failure is logged and swallowed; the read NEVER fails. This is the
 * only runtime writer of retrieval_log (the build plane writes activation
 * rows).
 */

import type pg from "pg";

import { runAudit } from "../db.js";

/** The serving subset of the schema CHECK vocabulary. */
const READ_ACTIONS = new Set([
  "similarity_searched",
  "search_abstained",
  "outline_served",
  "content_served",
] as const);

export type ReadAction =
  | "similarity_searched"
  | "search_abstained"
  | "outline_served"
  | "content_served";

const INSERT = `
INSERT INTO retrieval_log
  (tenant_id, corpus_id, generation, actor, action,
   embedding_model, chunk_policy_version, instance_bundle_sha256, detail)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`;

export interface ReadLogEntry {
  readonly tenantId: string;
  readonly corpusId: string;
  readonly actor: string;
  readonly action: ReadAction;
  readonly instanceDigest: string;
  readonly generation?: number | null;
  readonly embeddingModel?: string | null;
  readonly chunkPolicyVersion?: string | null;
  readonly detail?: Record<string, unknown>;
}

/**
 * Returns whether the row landed so a caller can surface an audit-degraded
 * signal; never raises.
 */
export async function logRead(pool: pg.Pool, entry: ReadLogEntry): Promise<boolean> {
  if (!READ_ACTIONS.has(entry.action)) {
    // A programming error made loud in logs, not raised mid-read.
    console.error(`refusing to log unknown read action ${JSON.stringify(entry.action)}`);
    return false;
  }
  try {
    await runAudit(pool, entry.tenantId, async (client) => {
      await client.query(INSERT, [
        entry.tenantId,
        entry.corpusId,
        entry.generation ?? null,
        entry.actor,
        entry.action,
        entry.embeddingModel ?? null,
        entry.chunkPolicyVersion ?? null,
        entry.instanceDigest,
        JSON.stringify(entry.detail ?? {}),
      ]);
    });
    return true;
  } catch (error) {
    console.warn(
      `retrieval_log write failed (swallowed — the read never fails): ${error instanceof Error ? error.name : "Error"}`,
    );
    return false;
  }
}
