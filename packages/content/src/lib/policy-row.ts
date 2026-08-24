/**
 * The policy the door binds to — read from the ACTIVE run's row, never from
 * a file the served container does not carry (record spec §4: "the policy is
 * ingested … so the door and the snapshot token bind to a row").
 */
import type pg from "pg";

import { runRead } from "../db.js";
import type { ContentInstance } from "../instance.js";

export interface ServingPolicy {
  /** Registered audience identifiers; `public` is implicit and never listed. */
  readonly registry: readonly string[];
  readonly takedownActors: readonly string[];
  readonly policySha256: string | null;
}

/** null when the record has no active generation yet, or its run predates 2.5. */
export async function servingPolicy(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<ServingPolicy | null> {
  return runRead(pool, instance.tenantId, async (client) => {
    const r = await client.query(
      `SELECT r.policy, r.policy_sha256 FROM ingestion_runs r
         JOIN corpora c ON c.tenant_id = r.tenant_id AND c.corpus_id = r.corpus_id
                       AND c.active_generation = r.generation
        WHERE r.tenant_id = $1 AND r.corpus_id = $2 ORDER BY r.run_id DESC LIMIT 1`,
      [instance.tenantId, instance.corpusId],
    );
    const row = r.rows[0] as
      | { policy: Record<string, unknown> | null; policy_sha256: string | null }
      | undefined;
    if (row === undefined || row.policy === null) return null;
    const audiences = row.policy["audiences"];
    const takedown = row.policy["takedown_authorities"] as { actors?: unknown } | undefined;
    const actors = takedown?.actors;
    return {
      registry: Array.isArray(audiences) ? audiences.map(String) : [],
      takedownActors: Array.isArray(actors) ? actors.map(String) : [],
      policySha256: row.policy_sha256,
    };
  });
}

/**
 * The widest viewer list this record has: `public` plus every audience the
 * ingested policy registers.
 *
 * Calibration binds it, because a floor is a property of the RECORD and not of
 * one caller's tier — and binds THIS rather than the `*` sentinel, because the
 * sentinel is a scope no door ever serves through. A record whose run carries
 * no policy (no active generation yet) has nothing registered, which is
 * `[public]`: the level-0 shape, and the whole record.
 */
export async function widestViewer(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<readonly string[]> {
  const policy = await servingPolicy(pool, instance);
  return ["public", ...(policy?.registry ?? [])];
}
