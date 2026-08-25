/**
 * The boot checks the SERVING door owes the record — and `ksor ingest` runs
 * against the generation it just built, so the act that creates the state
 * refuses where it happens (decision 19: a surface that refuses must refuse
 * on BOTH surfaces).
 *
 *   the pre-profile generation   A generation built before schema 2.5 carries
 *                                a ranked tier the migration could only narrow
 *                                to a one-element list, not the audience lists
 *                                the record declares. It refuses until
 *                                re-ingested (GOVERNANCE_SINCE).
 *
 *   an unledgered denial         A denylist row with no ledger entry — written
 *                                before `.ksor/takedowns.yaml` existed, or by
 *                                hand. Nothing in the repository accounts for
 *                                it (`ksor-takedown-unledgered`).
 *
 *   a denial that has            A row whose stable_id names nothing in the
 *   stopped applying             serving generation denies NOTHING, silently,
 *                                on both surfaces (issue #85).
 *
 *   an unmerged denial           REPORTED, not refused: the verb wrote the row
 *                                and the entry together, and the entry's pull
 *                                request never merged (`ksor-takedown-unmerged`).
 *
 * All are read-only checks on one generation, so they cost a query each at
 * boot and nothing per request.
 */

import { compareSchemaVersion } from "./migrate.js";
import { runRead } from "./db.js";
import { unmergedForGeneration } from "./ingest/ledger-apply.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

/** The first schema version whose generations carry governance on the node row. */
export const GOVERNANCE_SINCE = "2.5";

/**
 * A governance refusal — raised by the door at boot and by `ksor ingest`.
 *
 * Its text has TWO audiences and they are not owed the same thing. The OPERATOR
 * reads the server's logs and needs the identifiers: which documents are
 * unaccounted for. A CALLER reads the 503, and under `KSOR_AUTH=disabled-public`
 * a caller is anyone who can reach the port — so naming the `stable_id`s of
 * documents somebody WITHDREW enumerates the takedowns to exactly the people a
 * takedown is performed against. Two of the messages below did that.
 *
 * So identifiers arrive through their OWN parameter, and are appended to
 * `message` alone. `wire` — what `refusalBody` puts on the 503 and what `/ready`
 * reports — is the text this constructor was handed, and there is no route from
 * `names` into it. That is the point of the shape: a split maintained by
 * discipline has to be re-decided at every future throw site, and this one
 * cannot be got wrong.
 */
export class GovernanceGateError extends Error {
  override readonly name: string = "GovernanceGateError";
  /** The refusal MINUS every identifier — safe for an unauthenticated caller. */
  readonly wire: string;

  constructor(wire: string, names: readonly string[] = []) {
    super(names.length === 0 ? wire : `${wire}\n  named for your logs only: ${preview(names)}`);
    this.wire = wire;
  }
}

/**
 * At most five, then a count. Held HERE rather than at each site so every
 * refusal truncates the same way — and because `ksor takedown --list`, which
 * each remedy already names, is where the full list belongs.
 */
function preview(names: readonly string[]): string {
  const shown = names.slice(0, 5).join(", ");
  const more = names.length - Math.min(5, names.length);
  return more > 0 ? `${shown}, and ${more} more` : shown;
}

export interface GateOptions {
  /** Governance REPORTS that are not refusals (`ksor-takedown-unmerged`) — stderr at boot and at ingest. */
  readonly report?: (line: string) => void;
}

/**
 * Refuse to serve a record whose governance cannot be honoured.
 *
 * Returns silently when there is nothing to refuse — including for a record
 * with no active generation yet, which is a fresh project, not a violation.
 */
export async function assertGovernanceServable(
  pool: pg.Pool,
  instance: ContentInstance,
  /**
   * Which generation to judge. Omitted = the ACTIVE one, which is what serving
   * asks about. `ksor ingest` passes the generation it just built, so the act
   * that CREATES an unservable record refuses at the moment it happens instead
   * of leaving a green publish step and a crash-looping container behind
   * (round-6 review of #43).
   */
  targetGeneration?: number,
  options: GateOptions = {},
): Promise<void> {
  const state = await runRead(pool, instance.tenantId, async (client) => {
    const active =
      targetGeneration === undefined
        ? await client.query(
            "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
            [instance.tenantId, instance.corpusId],
          )
        : { rows: [{ active_generation: targetGeneration }] };
    const generation = Number(active.rows[0]?.active_generation ?? 0);
    if (generation === 0) {
      return {
        generation,
        builtAt: null,
        ledgerIds: null as string[] | null,
        orphaned: [] as string[],
        unledgered: [] as string[],
        unmerged: [] as { stableId: string; ledgerId: string }[],
      };
    }

    const run = await client.query(
      "SELECT schema_version, ledger_ids FROM ingestion_runs WHERE tenant_id = $1 AND corpus_id = $2 AND generation = $3",
      [instance.tenantId, instance.corpusId, generation],
    );
    const builtAt = (run.rows[0]?.schema_version ?? null) as string | null;
    const ledgerIds = (run.rows[0]?.ledger_ids ?? null) as string[] | null;

    // Every IN-FORCE denial must still name something in this generation —
    // EXCEPT one whose document the record itself says was deleted.
    //
    // Asked of the denylist rather than of the nodes, because the failure is a
    // row that matches NOTHING — invisible from the content side.
    //
    // `expected = 'removed'` is excluded because for that row "no node with this
    // id" is the CORRECT and permanent state, not a symptom. Without the
    // exclusion this check fired forever on the sequence record spec §5
    // sanctions — withdraw, then delete the file — and on every denial
    // `ksor migrate --write` transcribes for an already-deleted document, so an
    // upgraded record could not publish at all. Worse, the remedy printed below
    // could not clear it: `--removed` writes an amendment about the FILE and
    // moves no row, so the only state that lifted the refusal was a revocation,
    // i.e. un-withdrawing the document. Meanwhile `ksor build` and the site were
    // green, because the record checker accepts `removed` with the path absent —
    // decision 19's forbidden state with the surfaces inverted (review
    // 2026-08-25).
    //
    // This narrows only the ORPHAN check. A `removed` row stays in force and the
    // DENIED seam never reads `expected`, so the document remains withdrawn.
    //
    // WHAT IT GIVES UP, stated rather than discovered later: an operator who
    // withdrew a document, RENAMED it, and then falsely recorded `--removed`
    // republishes it under the new id with nothing complaining. The check never
    // actually protected against that — the refusal it raised could only be
    // cleared by revoking the denial, which republishes the document too — so
    // the exclusion trades a detection that did not exist for an escape that did
    // not either. `--removed` is an ASSERTION by a named actor (decision 21) in
    // an append-only ledger reviewed in a pull request, and the gate's own
    // message says the tool cannot tell a rename from a deletion. Attribution
    // and review are the guarantee here; path matching never could be.
    const orphaned = (
      await client.query<{ stable_id: string }>(
        "SELECT d.stable_id FROM takedown_denylist d" +
          " WHERE d.tenant_id = $1 AND d.corpus_id = $2 AND d.revoked_at IS NULL" +
          "   AND d.expected <> 'removed'" +
          "   AND NOT EXISTS (SELECT 1 FROM content_nodes n" +
          "                    WHERE n.tenant_id = d.tenant_id AND n.corpus_id = d.corpus_id" +
          "                      AND n.generation = $3 AND n.stable_id = d.stable_id)" +
          " ORDER BY d.stable_id",
        [instance.tenantId, instance.corpusId, generation],
      )
    ).rows.map((r) => r.stable_id);

    // The ledger is the record of WHO denied WHAT (record spec §5). A row with
    // no ledger id was written before the ledger existed, or by hand: nothing
    // in the repository accounts for it, so the door refuses until an ingest
    // attaches an entry by stable_id. A row whose entry the ingested ledger
    // does not contain was written by the verb on a branch that never merged:
    // reported, because the door is refusing what the site is not.
    const rows = (
      await client.query<{ stable_id: string; ledger_id: string | null }>(
        "SELECT stable_id, ledger_id FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY stable_id",
        [instance.tenantId, instance.corpusId],
      )
    ).rows;
    const unledgered = rows.filter((r) => r.ledger_id === null).map((r) => r.stable_id);
    const known = new Set(ledgerIds ?? []);
    const unmerged = rows
      .filter((r) => r.ledger_id !== null && !known.has(r.ledger_id))
      .map((r) => ({ stableId: r.stable_id, ledgerId: r.ledger_id! }));

    return { generation, builtAt, ledgerIds, orphaned, unledgered, unmerged };
  });

  if (state.generation === 0) return;

  if (state.builtAt === null || compareSchemaVersion(state.builtAt, GOVERNANCE_SINCE) < 0) {
    throw new GovernanceGateError(
      `generation ${state.generation} was built against schema ` +
        `${state.builtAt ?? "(before 2.4, which is when a generation started recording this)"}, ` +
        `older than ${GOVERNANCE_SINCE} — the version that put the profile's audience list on the node row\n` +
        "  why: the documents in this generation carry a ranked tier the 2.5 migration could only " +
        "narrow to a one-element list, not the audience lists the record now declares. Serving it " +
        "would answer every viewer from a half-mapped row\n" +
        "  fix: rebuild the record so its governance reaches the database:\n" +
        "    ksor build && ksor ingest --instance instance.md --flip",
    );
  }

  if (state.unledgered.length > 0) {
    throw new GovernanceGateError(
      `ksor-takedown-unledgered: ${state.unledgered.length} denial(s) carry no ledger entry\n` +
        "  why: .ksor/takedowns.yaml is the record of who withdrew what; a row nothing in the " +
        "repository accounts for cannot be reviewed, revoked or reproduced\n" +
        "  fix: run `ksor migrate --write` to record every existing row in the ledger, commit, " +
        "and `ksor ingest` — which attaches each entry to its row by stable_id",
      state.unledgered,
    );
  }

  if (state.orphaned.length > 0) {
    throw new GovernanceGateError(
      `${state.orphaned.length} takedown(s) match no document in generation ${state.generation}\n` +
        "  why: a denial is recorded against a stable_id, and the serving predicate matches it " +
        "against the documents in this generation. An id that no longer exists denies NOTHING — " +
        "so a withdrawn document that was renamed or moved is served again by search, read, " +
        "outline and the site, with no error anywhere. The denial is meant to be immune to " +
        "reorganization; this is the state where it is not\n" +
        "  fix: record the removal or deny the new path — never guess which, because the tool " +
        "cannot tell a rename from a deletion:\n" +
        "    ksor takedown --actor <who> --removed <ledger id>\n" +
        "    ksor takedown --actor <who> --reason <why> <the new stable_id>\n" +
        "  (ksor takedown --list shows what is recorded)",
      state.orphaned,
    );
  }

  for (const line of unmergedForGeneration(state.unmerged, state.generation)) {
    (options.report ?? console.error)(line);
  }
}
