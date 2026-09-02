/**
 * What a door is serving: the active generation, what it holds, and the commit
 * it was ingested from — or `null` when nothing has ever been published.
 *
 * Read from the ROWS, the way the policy is (`policy-row.ts`), because the
 * served container carries no lock file. The door booted green on a
 * provisioned, never-ingested record — db, audience, trust, auth, abstain,
 * serving — six lines about a record with nothing in it and not one saying so;
 * following `ksor init`'s own steps reaches that state (found live,
 * 2026-09-02). Honest absence, never silent weakness.
 */
import type pg from "pg";

import { runRead } from "../db.js";
import type { ContentInstance } from "../instance.js";

export interface PublishedGeneration {
  readonly generation: number;
  /** Rows in that generation — the count `ksor ingest` printed when it published it. */
  readonly nodes: number;
  /** `ingestion_runs.source_commit`: a sha, or `unspecified` when the tree had none. */
  readonly sourceCommit: string;
}

// Nodes are scoped by (tenant, generation), which is how every serving
// statement reads them; `corpus_id` on the node row is a 2.2 annotation that
// hand-built generations may leave NULL.
const PUBLISHED_SQL = `
SELECT c.active_generation AS generation,
       r.source_commit,
       (SELECT count(*)::int FROM content_nodes n
         WHERE n.tenant_id = c.tenant_id AND n.generation = c.active_generation) AS nodes
  FROM corpora c
  LEFT JOIN ingestion_runs r
    ON r.tenant_id = c.tenant_id AND r.corpus_id = c.corpus_id
   AND r.generation = c.active_generation
 WHERE c.tenant_id = $1 AND c.corpus_id = $2`;

/**
 * One statement on an already-scoped client, so a readiness probe can read it
 * in place of its own `SELECT 1` and keep the answer fresh without a second
 * statement per probe.
 */
export async function readPublished(
  client: pg.PoolClient,
  instance: ContentInstance,
): Promise<PublishedGeneration | null> {
  const r = await client.query(PUBLISHED_SQL, [instance.tenantId, instance.corpusId]);
  const row = r.rows[0] as
    | { generation: unknown; source_commit: string | null; nodes: unknown }
    | undefined;
  const generation = Number(row?.generation ?? 0);
  if (row === undefined || generation === 0) return null;
  return {
    generation,
    nodes: Number(row.nodes ?? 0),
    sourceCommit: row.source_commit ?? "unspecified",
  };
}

export async function publishedGeneration(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<PublishedGeneration | null> {
  return runRead(pool, instance.tenantId, (client) => readPublished(client, instance));
}
