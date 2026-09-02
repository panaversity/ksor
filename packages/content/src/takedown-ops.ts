/**
 * The takedown READ plane — what is denied, and the acts that made it so.
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

import { runRead } from "./db.js";
import type { ContentInstance } from "./instance.js";
import { inForce, type Ledger } from "./record/ledger.js";

export type TakedownScope = "node" | "subtree";

export interface TakedownRow {
  readonly stableId: string;
  readonly scope: TakedownScope;
  readonly reason: string;
  readonly createdAt: Date;
}

/**
 * One governance act, in the shape the §7 trail records it — the act, who, and
 * the detail. `ledgerActs` builds these from the committed FILE.
 *
 * There is no reader of the database's own trail here any more. `readLedger`
 * lived at this spot and lost its last caller when `--ledger` became the file's
 * history on every rung: a projection nobody prints is code without a claim
 * (coding principle 1), and the trail itself is unaffected — it is still
 * written by `ingest/ledger-apply.ts` and `ingest/generation.ts`, still
 * readable only through `runAuditRead`, and still read by
 * `ksor calibrate --check` and by `ksor migrate`. What the deletion removes is
 * a second answer to "what has been done to this record", which the ledger
 * already answers from the repository and without a database.
 */
export interface LedgerRow {
  readonly action: string;
  readonly actor: string;
  readonly generation: number | null;
  readonly detail: Record<string, unknown>;
  readonly createdAt: Date;
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
 * NOT the database's §7 trail, which also records the APPLY of each entry to
 * the door and which no verb prints. The file's own history is what the flag
 * prints on every rung — it is the record of the act (record spec §5), it is
 * where `--revoke`'s entry ids live, and it never needs a DSN.
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
