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
import { inForce, type Ledger } from "./record/ledger.js";

export type TakedownScope = "node" | "subtree";

export interface TakedownRow {
  readonly stableId: string;
  readonly scope: TakedownScope;
  readonly reason: string;
  readonly createdAt: Date;
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
      // `revoked_at IS NULL` is what `lib/takedown.ts` reads, and this is the
      // operator's own view of the same state: a revoked row is denied nowhere,
      // so listing it reports a withdrawal that no surface is enforcing.
      "SELECT stable_id, scope, reason, created_at FROM takedown_denylist" +
        " WHERE tenant_id = $1 AND corpus_id = $2 AND revoked_at IS NULL" +
        " ORDER BY created_at, stable_id",
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
 * The same two read-plane answers, from the committed ledger alone — the
 * level-0 rung, where `instance.md` declares no `database:`.
 *
 * `.ksor/takedowns.yaml` is the record of every governance act and the row is a
 * projection of it (record spec §5), so at this rung the file IS the state and
 * both flags are answerable without a database. They used to refuse — which
 * broke the workflow the scaffold's own AGENTS.md documents, since `--revoke`
 * takes a LEDGER ENTRY id and `--ledger` is what lists it, leaving the adopter
 * to open the YAML by hand.
 */

/** What `--list` prints: the denials in force, oldest first. */
export function ledgerDenials(ledger: Ledger): TakedownRow[] {
  return inForce(ledger)
    .map((d) => ({
      stableId: d.stableId,
      scope: d.scope,
      reason: d.reason ?? "",
      createdAt: new Date(d.at),
    }))
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.stableId < b.stableId ? -1 : a.stableId > b.stableId ? 1 : 0),
    );
}

/**
 * What `--ledger` prints: every entry the file records, newest first, in the
 * shape the database trail uses — the act, who, and the detail.
 *
 * NOT the database's §7 trail (`readLedger`), which also records the APPLY of
 * each entry to the door. The file's own history is what the flag prints on
 * every rung — it is the record of the act (record spec §5), it is where
 * `--revoke`'s entry ids live, and it never needs a DSN.
 */
export function ledgerActs(ledger: Ledger): LedgerRow[] {
  return [...ledger.entries]
    .map((e): LedgerRow => {
      const common = { ledger_id: e.id, reason: e.reason, via: "ledger" };
      const detail =
        e.kind === "denial"
          ? { ...common, stable_id: e.stableId, scope: e.scope, expected: e.expected }
          : e.kind === "revocation"
            ? { ...common, revokes: e.revokes }
            : { ...common, amends: e.amends };
      return {
        action: `takedown_${e.kind === "denial" ? "denied" : e.kind === "revocation" ? "revoked" : "amended"}`,
        actor: e.by,
        generation: null,
        detail,
        createdAt: new Date(e.at),
      };
    })
    .reverse();
}
