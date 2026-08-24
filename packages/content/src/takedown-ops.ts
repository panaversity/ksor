/**
 * The takedown READ plane — what is denied, and the §7 acts that made it so.
 *
 * The WRITES moved out (record spec §5): the ledger `.ksor/takedowns.yaml` is
 * the record of every denial, revocation and amendment, and `ingest/
 * ledger-apply.ts` projects it onto `takedown_denylist` — one code path, run
 * by `ksor takedown` and by `ksor ingest` alike, so the file can always
 * rebuild the row and nothing can rebuild the file from the row. The manifest
 * export went with them: the site reads the ledger from the repository, so
 * there is nothing for a build to ask a database for.
 *
 * Scope is decision 14's, unchanged: `node` denies exactly the listed
 * stable_id; `subtree` denies it and every descendant, resolved at serving
 * time. A container is never guessed at — the caller says which.
 */

import type pg from "pg";

import { runAuditRead, runRead } from "./db.js";
import type { ContentInstance } from "./instance.js";

export type TakedownScope = "node" | "subtree";

export interface TakedownRow {
  readonly stableId: string;
  readonly scope: TakedownScope;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface TakedownOutcome {
  readonly stableId: string;
  readonly scope: TakedownScope;
  /** false when the row already said exactly this — the act is idempotent. */
  readonly changed: boolean;
  /** Does this stable_id name a document in the generation being served? */
  readonly resolves?: boolean;
}

/** The ledger, readable at last — through the auditor role (schema 2.3). */
export interface LedgerRow {
  readonly action: string;
  readonly actor: string;
  readonly generation: number | null;
  readonly detail: Record<string, unknown>;
  readonly createdAt: Date;
}

export async function readLedger(
  pool: pg.Pool,
  instance: ContentInstance,
  limit: number,
): Promise<LedgerRow[]> {
  return runAuditRead(pool, instance.tenantId, async (client) => {
    const r = await client.query(
      // Scoped by CORPUS as well as tenant. Every governance write records
      // corpus_id and `listTakedowns` already scoped by it; this did not, so a
      // tenant serving two corpora — the shape AGENTS.md's open question 1 is
      // preparing for — got one record's audit answer polluted with the
      // other's, under the verb whose whole purpose is a per-record governance
      // trail (round-9 review of PR 43).
      "SELECT action, actor, generation, detail, created_at FROM retrieval_log" +
        " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3",
      [instance.tenantId, instance.corpusId, limit],
    );
    return r.rows.map((row: Record<string, unknown>) => ({
      action: String(row.action),
      actor: String(row.actor),
      generation: row.generation === null ? null : Number(row.generation),
      detail: (row.detail ?? {}) as Record<string, unknown>,
      createdAt: row.created_at as Date,
    }));
  });
}

export async function listTakedowns(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<TakedownRow[]> {
  return runRead(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      "SELECT stable_id, scope, reason, created_at FROM takedown_denylist" +
        " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at, stable_id",
      [instance.tenantId, instance.corpusId],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      stableId: String(r.stable_id),
      scope: String(r.scope) as TakedownScope,
      reason: String(r.reason),
      createdAt: r.created_at as Date,
    }));
  });
}
