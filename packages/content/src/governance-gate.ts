/**
 * Three boot checks the SERVING door owes the record.
 *
 * Product principle 2 is that the site and the MCP door render the same corpus
 * and must never read different truths. Each of these was a state where the
 * site stopped with a named error and the door came up clean and served the
 * restricted half (round-5 review of #43).
 *
 *   the ungoverned generation   The 2.1 -> 2.2 migration added
 *                               `content_nodes.visibility` and could not
 *                               backfill it — a migration cannot read
 *                               frontmatter. So on an upgraded database every
 *                               pre-existing node has visibility NULL, and the
 *                               serving predicate coalesces NULL to
 *                               `default_visibility`: the WIDEST tier. Schema
 *                               2.4 stamps each generation with the schema it
 *                               was built against, which makes that state
 *                               detectable instead of invisible.
 *
 *   visibility with no model    A document declaring `visibility: internal`
 *                               while `instance.md` declares no `audiences:`
 *                               is an author restricting something that
 *                               nothing enforces. The site refuses exactly
 *                               this, by name: "this build would publish a
 *                               document its author restricted, and the key
 *                               saying otherwise would be the only trace."
 *
 *   a denial that has          `takedown_denylist` records a stable_id, and the
 *   stopped applying            serving seam matches those rows against nodes in
 *                               the SERVING generation. A row whose id no longer
 *                               exists denies NOTHING — silently, on both
 *                               surfaces. The default stable_id is path-derived,
 *                               so renaming or moving a denied file is enough;
 *                               adding an index.md to a denied section is enough.
 *                               Reproduced end to end before this check existed
 *                               (issue #85). Decision 14 calls the denylist
 *                               "identity, immune to reorganization, an auditable
 *                               frozen list" — nothing made that true, and this
 *                               makes it true by REFUSING rather than by guessing
 *                               which node the operator meant.
 *
 * All three are read-only checks on one generation, so they cost one query each
 * at boot and nothing per request. Each runs at BOTH ends: the door asks about
 * the active generation, and `ksor ingest` asks about the generation it just
 * built, so the act that creates the state refuses where it happens.
 */

import { compareSchemaVersion } from "./migrate.js";
import { runRead } from "./db.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

/** The first schema version whose generations carry governance on the node row. */
export const GOVERNANCE_SINCE = "2.2";

export class GovernanceGateError extends Error {
  override readonly name: string = "GovernanceGateError";
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
): Promise<void> {
  const declaresModel = instance.audiences.length > 0;

  const state = await runRead(pool, instance.tenantId, async (client) => {
    const active =
      targetGeneration === undefined
        ? await client.query(
            "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
            [instance.tenantId, instance.corpusId],
          )
        : { rows: [{ active_generation: targetGeneration }] };
    const generation = Number(active.rows[0]?.active_generation ?? 0);
    if (generation === 0)
      return { generation, builtAt: null, restricted: 0, orphaned: [] as string[] };

    const run = await client.query(
      "SELECT schema_version FROM ingestion_runs WHERE tenant_id = $1 AND corpus_id = $2 AND generation = $3",
      [instance.tenantId, instance.corpusId, generation],
    );
    const builtAt = (run.rows[0]?.schema_version ?? null) as string | null;

    // Only asked when the record declares NO model, and only then does the
    // answer change anything.
    const restricted = declaresModel
      ? 0
      : Number(
          (
            await client.query(
              "SELECT count(*)::int AS n FROM content_nodes WHERE tenant_id = $1 AND generation = $2 AND visibility IS NOT NULL",
              [instance.tenantId, generation],
            )
          ).rows[0].n,
        );
    // Every recorded denial must still name something in this generation. Asked
    // of the denylist rather than of the nodes, because the failure is a row
    // that matches NOTHING — invisible from the content side.
    const orphaned = (
      await client.query<{ stable_id: string }>(
        "SELECT d.stable_id FROM takedown_denylist d" +
          " WHERE d.tenant_id = $1 AND d.corpus_id = $2" +
          "   AND NOT EXISTS (SELECT 1 FROM content_nodes n" +
          "                    WHERE n.tenant_id = d.tenant_id AND n.corpus_id = d.corpus_id" +
          "                      AND n.generation = $3 AND n.stable_id = d.stable_id)" +
          " ORDER BY d.stable_id",
        [instance.tenantId, instance.corpusId, generation],
      )
    ).rows.map((r) => r.stable_id);

    return { generation, builtAt, restricted, orphaned };
  });

  if (state.generation === 0) return;

  if (
    declaresModel &&
    (state.builtAt === null || compareSchemaVersion(state.builtAt, GOVERNANCE_SINCE) < 0)
  ) {
    throw new GovernanceGateError(
      `generation ${state.generation} was built against schema ` +
        `${state.builtAt ?? "(before 2.4, which is when a generation started recording this)"}, ` +
        `older than ${GOVERNANCE_SINCE} — the version that put visibility on the node row\n` +
        "  why: instance.md declares an audience model, but the documents in this generation " +
        "carry no visibility at all. Every one of them would be served at default_visibility — " +
        "the WIDEST tier — including any document whose frontmatter restricts it\n" +
        "  fix: rebuild the record so its governance reaches the database:\n" +
        "    ksor ingest --instance instance.md --knowledge knowledge --flip",
    );
  }

  if (state.orphaned.length > 0) {
    const named = state.orphaned.slice(0, 5).join(", ");
    const more = state.orphaned.length - Math.min(5, state.orphaned.length);
    throw new GovernanceGateError(
      `${state.orphaned.length} takedown(s) match no document in generation ${state.generation}: ` +
        `${named}${more > 0 ? `, and ${more} more` : ""}\n` +
        "  why: a denial is recorded against a stable_id, and the serving predicate matches it " +
        "against the documents in this generation. An id that no longer exists denies NOTHING — " +
        "so a withdrawn document that was renamed, moved, or had an index.md added beside it is " +
        "served again by search, read, outline and the site, with no error anywhere. The denial " +
        "is meant to be immune to reorganization; this is the state where it is not\n" +
        "  fix: point the denial at where the document lives now, or retire it deliberately — " +
        "never guess which one, because the tool cannot tell a rename from a deletion:\n" +
        "    ksor takedown --instance instance.md --stable-id <the new id> --reason <why> --actor <who>\n" +
        "    ksor takedown --instance instance.md --revoke <the old id> --actor <who>\n" +
        "  (ksor takedown --list shows what is recorded)",
    );
  }

  if (!declaresModel && state.restricted > 0) {
    throw new GovernanceGateError(
      `${state.restricted} document(s) in generation ${state.generation} declare visibility:, ` +
        "but instance.md declares no audiences:\n" +
        "  why: an author restricted those documents and nothing would enforce it — this door " +
        "would serve them in full to every caller, and the frontmatter key saying otherwise " +
        "would be the only trace. The site refuses to BUILD in this exact state " +
        "(ksor-visibility-without-audiences); the door must not serve in it\n" +
        "  fix: declare the model in instance.md (audiences: least-restricted first, plus " +
        "default_visibility:), or remove the visibility: keys and re-ingest",
    );
  }
}
