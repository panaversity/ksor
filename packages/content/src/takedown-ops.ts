/**
 * The takedown WRITE plane — the operator door decision 14 designed and never
 * shipped.
 *
 * The denial mechanism was complete and correct on the serving side, but the
 * only way to invoke it was a hand-written INSERT: the one governance action
 * most likely to arrive as a legal deadline was reachable only by someone with
 * a psql prompt and knowledge of the table shape, and it left no row proving
 * who performed it (review 2026-08-20). Governance governs ACTS — a mechanism
 * with no door constrains nothing.
 *
 * Scope is decision 14's, unchanged: `node` denies exactly the listed
 * stable_id; `subtree` denies it and every descendant, resolved at serving
 * time. A container is never guessed at — the caller says which.
 */

import type pg from "pg";

import { runAuditRead, runIngest } from "./db.js";
import type { ContentInstance } from "./instance.js";

/**
 * The §7 row for a governance act, written INSIDE the same transaction as the
 * act. `logRead` deliberately covers only the four serving actions; a takedown
 * is a write-plane act, and separating the two writes would allow a denial with
 * no row proving it happened — the one outcome the ledger exists to prevent.
 */
async function recordAct(
  client: pg.PoolClient,
  instance: ContentInstance,
  detail: Record<string, unknown>,
  actor: string,
): Promise<void> {
  await client.query(
    "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
      " VALUES ($1, $2, $3, 'takedown_applied', $4::jsonb)",
    [instance.tenantId, instance.corpusId, actor, JSON.stringify(detail)],
  );
}

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
}

/**
 * Deny a node (or its subtree) and record the act.
 *
 * The audit row is written in the SAME transaction as the denial: a takedown
 * that happened without a row proving it happened is exactly the shape the
 * §7 ledger exists to prevent.
 */
export async function applyTakedown(
  pool: pg.Pool,
  instance: ContentInstance,
  opts: { stableId: string; scope: TakedownScope; reason: string; actor: string },
): Promise<TakedownOutcome> {
  return runIngest(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
        " VALUES ($1, $2, $3, $4, $5)" +
        " ON CONFLICT (tenant_id, corpus_id, stable_id) DO UPDATE" +
        "   SET scope = EXCLUDED.scope, reason = EXCLUDED.reason" +
        " WHERE takedown_denylist.scope IS DISTINCT FROM EXCLUDED.scope" +
        "    OR takedown_denylist.reason IS DISTINCT FROM EXCLUDED.reason" +
        " RETURNING stable_id",
      [instance.tenantId, instance.corpusId, opts.stableId, opts.scope, opts.reason],
    );
    const changed = result.rowCount === 1;
    await recordAct(
      client,
      instance,
      {
        stable_id: opts.stableId,
        scope: opts.scope,
        reason: opts.reason,
        change: changed ? "applied" : "unchanged",
      },
      opts.actor,
    );
    return { stableId: opts.stableId, scope: opts.scope, changed };
  });
}

/** Lift a denial. The ledger keeps the row that recorded imposing it. */
export async function revokeTakedown(
  pool: pg.Pool,
  instance: ContentInstance,
  opts: { stableId: string; actor: string },
): Promise<TakedownOutcome> {
  return runIngest(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      "DELETE FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2 AND stable_id = $3",
      [instance.tenantId, instance.corpusId, opts.stableId],
    );
    const changed = (result.rowCount ?? 0) > 0;
    await recordAct(
      client,
      instance,
      { stable_id: opts.stableId, change: changed ? "revoked" : "not-denied" },
      opts.actor,
    );
    return { stableId: opts.stableId, scope: "node" as TakedownScope, changed };
  });
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
      "SELECT action, actor, generation, detail, created_at FROM retrieval_log" +
        " WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
      [instance.tenantId, limit],
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
  return runIngest(pool, instance.tenantId, async (client) => {
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

/**
 * The manifest the SITE build consumes.
 *
 * Takedown was a serving-plane mechanism only, so a denied document stayed
 * published on the human surface — `llms.txt` included, the file written
 * specifically for AI crawlers (review 2026-08-20, reproduced). The site
 * compiles `knowledge/` from disk and must stay database-free for `pnpm dev`
 * (decision 11), so the database's answer is EXPORTED to a file the build
 * reads rather than the build opening a connection.
 *
 * `source` is what makes it fail closed: a build that finds `"none"` knows the
 * project declares no database and there is nothing to deny, while a build
 * that finds no file at all knows it was never told and can refuse.
 */
export interface DenylistManifest {
  readonly format: 1;
  readonly corpus_id: string;
  readonly source: "database" | "none";
  readonly exported_at: string;
  readonly denied: readonly { stable_id: string; scope: TakedownScope }[];
}

export function denylistManifest(
  corpusId: string,
  rows: readonly TakedownRow[],
  now: Date,
): DenylistManifest {
  return {
    format: 1,
    corpus_id: corpusId,
    source: "database",
    exported_at: now.toISOString(),
    denied: rows.map((r) => ({ stable_id: r.stableId, scope: r.scope })),
  };
}

export function emptyDenylistManifest(corpusId: string, now: Date): DenylistManifest {
  return {
    format: 1,
    corpus_id: corpusId,
    source: "none",
    exported_at: now.toISOString(),
    denied: [],
  };
}
