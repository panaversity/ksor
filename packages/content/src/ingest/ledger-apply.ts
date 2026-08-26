/**
 * How a ledger entry lifts a row (record spec §5 "How a row lifts").
 *
 * `.ksor/takedowns.yaml` is the HISTORY; `takedown_denylist` is the STATE, one
 * row per stable_id. Applying the ledger folds the entries in file order into
 * the state each stable_id ends in — the latest IN-FORCE denial that names it,
 * or, when none is in force, the latest denial and the revocation that lifted
 * it — and upserts exactly that. So applying is idempotent by construction (the
 * same ledger folds to the same state), a re-denial after a revocation updates
 * the row's `ledger_id` and clears the revocation, a revocation sets
 * `revoked_ledger_id` / `revoked_at` on the row its `revokes` names, an
 * amendment changes no row (it records the FILE's expected state), rows are
 * never deleted, and a pre-existing unledgered row — written before the ledger
 * existed — gets its `ledger_id` attached by the stable_id match.
 *
 * WHICH DENIALS ARE LIVE IS `inForce`'S ANSWER, not a second one. The fold used
 * to key its own state by stable_id, last denial wins — so a stable_id carrying
 * TWO denials with only the newer revoked came out revoked here while `inForce`
 * (which keys by ENTRY id) still held the older one. The site kept the document
 * withdrawn and this fold cleared `revoked_at`, so the door served it: decision
 * 19's forbidden state, reached by two functions answering one question.
 *
 * Direction is file → database, always: the verb writes the entry first and
 * the row second, and ingest re-derives the rows from the merged file.
 */
import type pg from "pg";

import type { ContentInstance } from "../instance.js";
import { inForce } from "../record/ledger.js";
import type { Denial, Ledger } from "../record/ledger.js";
import type { IngestRefusal } from "./lock-gate.js";

export interface DenialState {
  readonly stableId: string;
  readonly denial: Denial;
  /**
   * What the ledger expects of the FILE, as the latest AMENDMENT left it —
   * which is not `denial.expected`, the value the author first wrote.
   *
   * `inForce` is the only thing that applies amendments, and it keys by entry
   * id, so this is read from there rather than re-derived. Carrying the
   * authored value instead is what left `expected` stranded in the file: every
   * piece was locally correct and the amended value simply never reached the
   * row, so a deliberately deleted document looked like an orphaned denial to
   * the boot gate forever (review 2026-08-25).
   */
  readonly expected: Denial["expected"];
  /**
   * The revocation entry that lifted it, or null while it is in force.
   *
   * `by` is here because the §7 row for a lifted denial must name the person
   * who LIFTED it. Collecting only `{ id, at }` left the insert with nothing
   * but the denial's actor to use, so the trail credited the denier with the
   * revocation and the revoker appeared nowhere — decision 21 inverted rather
   * than merely unmet (found in review, 2026-08-25).
   */
  readonly revokedBy: { readonly id: string; readonly by: string; readonly at: string } | null;
}

/** The state each denied stable_id ends in after the whole ledger, in first-seen order. */
export function foldLedger(ledger: Ledger): DenialState[] {
  const standing = inForce(ledger);
  const live = new Set(standing.map((d) => d.id));
  // `expected` as amendments left it, by entry id. A revoked denial is absent
  // here and falls back to what it declared; the orphan check never reads a
  // revoked row, so that fallback decides nothing.
  const amended = new Map(standing.map((d) => [d.id, d.expected]));
  const revocations = new Map<
    string,
    { readonly id: string; readonly by: string; readonly at: string }
  >();
  for (const entry of ledger.entries) {
    if (entry.kind === "revocation") {
      revocations.set(entry.revokes, { id: entry.id, by: entry.by, at: entry.at });
    }
  }

  const byStableId = new Map<string, DenialState>();
  for (const entry of ledger.entries) {
    if (entry.kind !== "denial") continue;
    const inForceNow = live.has(entry.id);
    const current = byStableId.get(entry.stableId);
    // A stable_id is denied while ANY denial naming it is in force, so a revoked
    // later entry must not overwrite an earlier one that still stands.
    if (current !== undefined && current.revokedBy === null && !inForceNow) continue;
    byStableId.set(entry.stableId, {
      stableId: entry.stableId,
      denial: entry,
      expected: amended.get(entry.id) ?? entry.expected,
      // `inForce` drops a denial only on revocation, so a denial that is not
      // live has a revocation naming it.
      revokedBy: inForceNow ? null : (revocations.get(entry.id) ?? null),
    });
  }
  return [...byStableId.values()];
}

export interface LedgerApplyReport {
  /** Rows inserted or changed by this application. */
  readonly changed: number;
  /** Rows whose `ledger_id` the ledger does not contain — the verb wrote them, the pull request never merged. */
  readonly unmerged: readonly { readonly stableId: string; readonly ledgerId: string }[];
  /**
   * Rows that STILL carry no ledger entry after the fold — written before
   * `.ksor/takedowns.yaml` existed (the 2.4 -> 2.5 migration cannot invent one)
   * or by hand.
   *
   * Measured AFTER the upsert, not before: the fold attaches an entry to a
   * pre-existing row by stable_id, so a row the ledger does name is no longer
   * unledgered by the time this is read. The caller refuses on it, and refusing
   * HERE is the point — `assertGovernanceServable` was already going to refuse
   * this state at the end of the same command, after a whole generation had
   * been built and embedded, and the operator had been told nothing at the one
   * moment the ledger was in front of the tool.
   */
  readonly unledgered: readonly string[];
}

/** The `ksor-takedown-unledgered` refusal: the rows, the reason, and the remedy that resolves it. */
export function unledgeredRefusal(stableIds: readonly string[]): IngestRefusal {
  const named = stableIds.slice(0, 5).join(", ");
  const more = stableIds.length - Math.min(5, stableIds.length);
  return {
    slug: "ksor-takedown-unledgered",
    path: ".ksor/takedowns.yaml",
    why:
      `${stableIds.length} denial row(s) carry no ledger entry: ${named}${more > 0 ? `, and ${more} more` : ""} — ` +
      ".ksor/takedowns.yaml is the record of who withdrew what, and a row nothing in the repository " +
      "accounts for cannot be reviewed, revoked or reproduced. `ksor serve` refuses to boot on it, so " +
      "publishing this generation would leave a record no surface can serve",
    fix:
      "run `ksor migrate --write` to record every existing row in the ledger, commit it, and ingest " +
      "again — the fold attaches each entry to its row by stable_id",
  };
}

export type UnmergedRow = { readonly stableId: string; readonly ledgerId: string };

/**
 * The `ksor-takedown-unmerged` report as the INGEST path sees it: the row names
 * an entry the ledger FILE does not contain.
 *
 * There are two of these, deliberately, and they used to be one. The two checks
 * compare against different things — this one against the file just parsed, the
 * boot gate against a snapshot of the file taken when the serving generation
 * was ingested — so a single sentence could only ever be true for one of them.
 * It was true here and false there (see {@link unmergedForGeneration}).
 */
export function unmergedLines(unmerged: readonly UnmergedRow[]): string[] {
  return unmerged.map(
    (u) =>
      `ksor-takedown-unmerged: ${u.stableId} is denied by ledger entry \`${u.ledgerId}\`, which .ksor/takedowns.yaml does not contain\n` +
      "  why: `ksor takedown` wrote the row and the entry together; the entry lives on a branch that was never merged, so the door refuses what the site does not\n" +
      `  fix: merge the change that added \`${u.ledgerId}\`, or revoke it: ksor takedown --actor <actor> --revoke ${u.ledgerId}`,
  );
}

/**
 * The same slug as the SERVING door sees it: the entry is not in the set this
 * generation was ingested with. It may be sitting in the committed ledger —
 * usually IS, because the ordinary way to reach this state is to take a
 * document down after ingesting.
 *
 * The door used to print the file-check sentence here, telling an operator that
 * their own `.ksor/takedowns.yaml` did not contain an entry that was in it, and
 * sending them to merge a branch that was already merged (found on a live walk,
 * 2026-08-25). The denial applied correctly throughout and this is a report
 * rather than a refusal — but a governance surface may not say something untrue
 * about the record it is serving, and a `fix:` that does nothing is worse than
 * none. It says what it compared, and names the act that reconciles it.
 */
export function unmergedForGeneration(
  unmerged: readonly UnmergedRow[],
  generation: number,
): string[] {
  return unmerged.map(
    (u) =>
      `ksor-takedown-unmerged: ${u.stableId} is denied by ledger entry \`${u.ledgerId}\`, which is not in the set generation ${generation} was ingested with\n` +
      `  why: the served generation was built before this entry existed, so the door is enforcing a denial the published generation has no record of. Ordinary after a takedown taken AFTER the last ingest — the denial IS in force, and the ledger file most likely does contain the entry\n` +
      "  fix: publish a generation that knows about it: ksor build && ksor ingest --instance instance.md --flip\n" +
      `       (if the entry is NOT in .ksor/takedowns.yaml, it was written on an unmerged branch — merge that change, or revoke it: ksor takedown --actor <actor> --revoke ${u.ledgerId})`,
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
         (tenant_id, corpus_id, stable_id, scope, reason, ledger_id, actor, applied_at, revoked_ledger_id, revoked_at, expected)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9::timestamptz, $10)
       ON CONFLICT (tenant_id, corpus_id, stable_id) DO UPDATE
         SET scope = EXCLUDED.scope,
             reason = EXCLUDED.reason,
             ledger_id = EXCLUDED.ledger_id,
             actor = EXCLUDED.actor,
             expected = EXCLUDED.expected,
             applied_at = CASE WHEN takedown_denylist.ledger_id IS DISTINCT FROM EXCLUDED.ledger_id
                               THEN now() ELSE takedown_denylist.applied_at END,
             revoked_ledger_id = EXCLUDED.revoked_ledger_id,
             revoked_at = EXCLUDED.revoked_at
       WHERE takedown_denylist.scope IS DISTINCT FROM EXCLUDED.scope
          OR takedown_denylist.reason IS DISTINCT FROM EXCLUDED.reason
          OR takedown_denylist.ledger_id IS DISTINCT FROM EXCLUDED.ledger_id
          OR takedown_denylist.actor IS DISTINCT FROM EXCLUDED.actor
          OR takedown_denylist.revoked_ledger_id IS DISTINCT FROM EXCLUDED.revoked_ledger_id
          OR takedown_denylist.expected IS DISTINCT FROM EXCLUDED.expected
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
        state.expected,
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
        // The actor of THIS act: the revoker when a denial was lifted, the
        // denier when it was applied. Never the process that ran ingest.
        revoked ? state.revokedBy!.by : d.by,
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
  // AFTER the fold: what the ledger still does not account for.
  const unledgered = (
    await client.query<{ stable_id: string }>(
      "SELECT stable_id FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2" +
        " AND ledger_id IS NULL ORDER BY stable_id",
      [instance.tenantId, instance.corpusId],
    )
  ).rows.map((r) => r.stable_id);

  return { changed, unmerged, unledgered };
}
