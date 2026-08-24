/**
 * How a ledger entry lifts a row (record spec §5 "How a row lifts").
 *
 * `.ksor/takedowns.yaml` is the HISTORY; `takedown_denylist` is the STATE, one
 * row per stable_id. Applying the ledger folds the entries in file order into
 * the state each stable_id ends in — the latest denial that names it, and
 * whether a revocation followed — and upserts exactly that. So applying is
 * idempotent by construction (the same ledger folds to the same state), a
 * re-denial after a revocation updates the row's `ledger_id` and clears the
 * revocation, a revocation sets `revoked_ledger_id` / `revoked_at` on the row
 * its `revokes` names, an amendment changes no row (it records the FILE's
 * expected state), rows are never deleted, and a pre-existing unledgered row —
 * written before the ledger existed — gets its `ledger_id` attached by the
 * stable_id match.
 *
 * Direction is file → database, always: the verb writes the entry first and
 * the row second, and ingest re-derives the rows from the merged file.
 */
import type pg from "pg";

import type { ContentInstance } from "../instance.js";
import type { Denial, Ledger } from "../record/ledger.js";

export interface DenialState {
  readonly stableId: string;
  readonly denial: Denial;
  /** The revocation entry that lifted it, or null while it is in force. */
  readonly revokedBy: { readonly id: string; readonly at: string } | null;
}

/** The state each denied stable_id ends in after the whole ledger, in first-seen order. */
export function foldLedger(ledger: Ledger): DenialState[] {
  const byEntry = new Map<string, DenialState>();
  const byStableId = new Map<string, string>();
  for (const entry of ledger.entries) {
    if (entry.kind === "denial") {
      const state: DenialState = { stableId: entry.stableId, denial: entry, revokedBy: null };
      byEntry.set(entry.id, state);
      byStableId.set(entry.stableId, entry.id);
    } else if (entry.kind === "revocation") {
      const target = byEntry.get(entry.revokes);
      if (target !== undefined) {
        byEntry.set(entry.revokes, { ...target, revokedBy: { id: entry.id, at: entry.at } });
      }
    }
    // an amendment marks the FILE's expected state; the row is unchanged
  }
  return [...byStableId.values()].map((id) => byEntry.get(id)!);
}

export interface LedgerApplyReport {
  /** Rows inserted or changed by this application. */
  readonly changed: number;
  /** Rows whose `ledger_id` the ledger does not contain — the verb wrote them, the pull request never merged. */
  readonly unmerged: readonly { readonly stableId: string; readonly ledgerId: string }[];
}

/** The `ksor-takedown-unmerged` report: named id, two fixes, one line each. */
export function unmergedLines(
  unmerged: readonly { readonly stableId: string; readonly ledgerId: string }[],
): string[] {
  return unmerged.map(
    (u) =>
      `ksor-takedown-unmerged: ${u.stableId} is denied by ledger entry \`${u.ledgerId}\`, which .ksor/takedowns.yaml does not contain\n` +
      "  why: `ksor takedown` wrote the row and the entry together; the entry lives on a branch that was never merged, so the door refuses what the site does not\n" +
      `  fix: merge the change that added \`${u.ledgerId}\`, or revoke it: ksor takedown --actor <actor> --revoke ${u.ledgerId}`,
  );
}

/**
 * Apply the folded ledger to the denylist and write the §7 rows for what
 * changed — inside the caller's transaction. Returns what changed and what
 * the file does not know about.
 */
export async function applyLedger(
  client: pg.PoolClient,
  instance: ContentInstance,
  ledger: Ledger,
): Promise<LedgerApplyReport> {
  const ids = new Set(ledger.ids);
  const before = await client.query<{ stable_id: string; ledger_id: string | null }>(
    "SELECT stable_id, ledger_id FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2",
    [instance.tenantId, instance.corpusId],
  );
  const unmerged = before.rows
    .filter((r) => r.ledger_id !== null && !ids.has(r.ledger_id))
    .map((r) => ({ stableId: r.stable_id, ledgerId: r.ledger_id! }))
    .sort((a, b) => (a.stableId < b.stableId ? -1 : 1));

  let changed = 0;
  for (const state of foldLedger(ledger)) {
    const d = state.denial;
    const r = await client.query(
      `INSERT INTO takedown_denylist
         (tenant_id, corpus_id, stable_id, scope, reason, ledger_id, actor, applied_at, revoked_ledger_id, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9::timestamptz)
       ON CONFLICT (tenant_id, corpus_id, stable_id) DO UPDATE
         SET scope = EXCLUDED.scope,
             reason = EXCLUDED.reason,
             ledger_id = EXCLUDED.ledger_id,
             actor = EXCLUDED.actor,
             applied_at = CASE WHEN takedown_denylist.ledger_id IS DISTINCT FROM EXCLUDED.ledger_id
                               THEN now() ELSE takedown_denylist.applied_at END,
             revoked_ledger_id = EXCLUDED.revoked_ledger_id,
             revoked_at = EXCLUDED.revoked_at
       WHERE takedown_denylist.scope IS DISTINCT FROM EXCLUDED.scope
          OR takedown_denylist.reason IS DISTINCT FROM EXCLUDED.reason
          OR takedown_denylist.ledger_id IS DISTINCT FROM EXCLUDED.ledger_id
          OR takedown_denylist.actor IS DISTINCT FROM EXCLUDED.actor
          OR takedown_denylist.revoked_ledger_id IS DISTINCT FROM EXCLUDED.revoked_ledger_id
       RETURNING (xmax = 0) AS inserted`,
      [
        instance.tenantId,
        instance.corpusId,
        d.stableId,
        d.scope,
        d.reason ?? "",
        d.id,
        d.by,
        state.revokedBy?.id ?? null,
        state.revokedBy?.at ?? null,
      ],
    );
    if (r.rowCount === 0) continue;
    changed += 1;
    // The §7 row, in the SAME transaction as the act it proves — attributed to
    // the ledger entry's actor, never to the process that applied it.
    const revoked = state.revokedBy !== null;
    await client.query(
      "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
        " VALUES ($1, $2, $3, $4, $5::jsonb)",
      [
        instance.tenantId,
        instance.corpusId,
        d.by,
        revoked ? "takedown_revoked" : "takedown_applied",
        JSON.stringify({
          stable_id: d.stableId,
          scope: d.scope,
          reason: d.reason,
          ledger_id: d.id,
          ...(revoked ? { revoked_ledger_id: state.revokedBy!.id } : {}),
          change: revoked ? "revoked" : "applied",
          via: "ledger",
        }),
      ],
    );
  }
  return { changed, unmerged };
}
