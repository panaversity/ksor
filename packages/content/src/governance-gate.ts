/**
 * Two boot checks the SERVING door owes the record, both of them shapes the
 * site already refuses to build.
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
 * Both are read-only checks on the ACTIVE generation, so they cost one query
 * each at boot and nothing per request.
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
): Promise<void> {
  const declaresModel = instance.audiences.length > 0;

  const state = await runRead(pool, instance.tenantId, async (client) => {
    const active = await client.query(
      "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
      [instance.tenantId, instance.corpusId],
    );
    const generation = Number(active.rows[0]?.active_generation ?? 0);
    if (generation === 0) return { generation, builtAt: null, restricted: 0 };

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
    return { generation, builtAt, restricted };
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
